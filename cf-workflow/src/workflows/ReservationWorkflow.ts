import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

// Reservation status types
export type ReservationStatus = 'pending' | 'held' | 'confirmed' | 'expired';

// User-defined params passed to the workflow
export type ReservationParams = {
    reservationId: string;
    seatId: string;
    userId?: string;
};

// Type for the CloudflareBindings (defined in worker-configuration.d.ts)
type Env = {
    RESERVATION_WORKFLOW: Workflow;
    RESERVATIONS_KV: KVNamespace;
};

// Reservation data structure stored in KV
export interface ReservationData {
    reservationId: string;
    seatId: string;
    userId?: string;
    status: ReservationStatus;
    createdAt: string;
    expiresAt: string;
    confirmedAt?: string;
    expiredAt?: string;
}

export class ReservationWorkflow extends WorkflowEntrypoint<Env, ReservationParams> {
    async run(event: WorkflowEvent<ReservationParams>, step: WorkflowStep) {
        const { reservationId, seatId, userId } = event.payload;

        // Step 1: Create the hold and write initial state to KV
        const reservation = await step.do('create-hold', async () => {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now

            const reservationData: ReservationData = {
                reservationId,
                seatId,
                userId,
                status: 'held',
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
            };

            // Write the initial "held" status to KV
            await this.env.RESERVATIONS_KV.put(
                reservationId,
                JSON.stringify(reservationData),
                { expirationTtl: 60 * 60 * 24 } // Keep for 24 hours for audit purposes
            );

            console.log(`[ReservationWorkflow] Created hold for reservation ${reservationId}, seat ${seatId}`);

            return reservationData;
        });

        // Step 2: Sleep for 15 minutes (the hold period)
        await step.sleep('wait-for-confirmation', '15 minutes');

        // Step 3: Check if reservation was confirmed, otherwise expire it
        await step.do('finalize-reservation', async () => {
            // Read current status from KV
            const currentData = await this.env.RESERVATIONS_KV.get(reservationId);

            if (!currentData) {
                console.log(`[ReservationWorkflow] Reservation ${reservationId} not found in KV`);
                return { status: 'not_found' };
            }

            const reservationData: ReservationData = JSON.parse(currentData);

            // If already confirmed, we're done
            if (reservationData.status === 'confirmed') {
                console.log(`[ReservationWorkflow] Reservation ${reservationId} was already confirmed`);
                return { status: 'confirmed' };
            }

            // If still held, expire it
            if (reservationData.status === 'held') {
                const expiredData: ReservationData = {
                    ...reservationData,
                    status: 'expired',
                    expiredAt: new Date().toISOString(),
                };

                await this.env.RESERVATIONS_KV.put(
                    reservationId,
                    JSON.stringify(expiredData),
                    { expirationTtl: 60 * 60 * 24 } // Keep for 24 hours for audit purposes
                );

                console.log(`[ReservationWorkflow] Reservation ${reservationId} expired (not confirmed in time)`);
                return { status: 'expired' };
            }

            // Already expired or in another state
            console.log(`[ReservationWorkflow] Reservation ${reservationId} is in state: ${reservationData.status}`);
            return { status: reservationData.status };
        });
    }
}
