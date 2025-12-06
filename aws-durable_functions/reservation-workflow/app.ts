import { withDurableExecution, DurableContext } from "@aws/durable-execution-sdk-js";

/**
 * ============================================================================
 * AWS LAMBDA DURABLE FUNCTIONS - Reservation Workflow Demo
 * ============================================================================
 * 
 * ONE Lambda function with MULTIPLE STEPS demonstrating:
 * - context.step()  → Creates checkpoint (won't re-run on replay)
 * - context.wait()  → Suspends execution (no compute cost during wait)
 * - Replay          → On resume, stored results are used, not re-executed
 * 
 * IMPORTANT LIMITATIONS:
 * - Only available in us-east-2 region
 * - Runtime: Node.js 24 (nodejs24.x)
 * - Durable execution must be enabled at function CREATION time
 * - Cannot add durable execution to existing functions
 * - Deploy using SAM (skip sam build) or AWS CLI
 * 
 * ============================================================================
 */

interface ReservationEvent {
    seatId: string;
    userId?: string;
}

interface ReservationData {
    reservationId: string;
    seatId: string;
    userId?: string;
    status: "held" | "confirmed" | "expired";
    createdAt: string;
    expiresAt: string;
}

/**
 * The Durable Reservation Workflow
 * 
 * Flow:
 *   STEP 1: Create hold → WAIT 15 min → STEP 2: Expire if not confirmed
 */
export const handler = withDurableExecution(
    async (event: ReservationEvent, context: DurableContext) => {
        const { seatId, userId } = event;

        // =====================================================================
        // STEP 1: Create the reservation hold
        // This step is CHECKPOINTED - won't re-run on replay
        // =====================================================================
        const reservation = await context.step(async (stepContext) => {
            const reservationId = crypto.randomUUID();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

            stepContext.logger.info(`[STEP 1] Creating hold for seat: ${seatId}`);
            stepContext.logger.info(`[STEP 1] Reservation ID: ${reservationId}`);

            const data: ReservationData = {
                reservationId,
                seatId,
                userId,
                status: "held",
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
            };

            return data;
        });

        context.logger.info(`[WAIT] Sleeping for 15 minutes...`);

        // =====================================================================
        // WAIT: Sleep for 15 minutes (NO COMPUTE COST!)
        // Function suspends here. Lambda re-invokes after wait completes.
        // =====================================================================
        // For testing: 30 seconds. Production: 15 * 60 (15 minutes)
        await context.wait({ seconds: 30 });

        // =====================================================================
        // STEP 2: Finalize - expire if not confirmed
        // =====================================================================
        const finalResult = await context.step(async (stepContext) => {
            stepContext.logger.info(`[STEP 2] Finalizing reservation ${reservation.reservationId}`);

            // In production: check DynamoDB if user confirmed
            // For demo: simulate expiration
            return {
                ...reservation,
                status: "expired" as const,
                expiredAt: new Date().toISOString(),
            };
        });

        return {
            message: "Reservation workflow completed",
            reservation: finalResult,
        };
    }
);
