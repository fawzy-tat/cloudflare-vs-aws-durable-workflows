import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ReservationWorkflow, ReservationData, ReservationStatus } from './workflows/ReservationWorkflow';

// Re-export the workflow class so Cloudflare can find it
export { ReservationWorkflow };

// Define the environment bindings
interface Env {
  RESERVATION_WORKFLOW: Workflow;
  RESERVATIONS_KV: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware
app.use('*', cors());

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    service: 'Reservation Workflow API',
    version: '1.0.0',
    endpoints: {
      reserve: 'POST /reserve',
      confirm: 'POST /confirm/:id',
      status: 'GET /reservation/:id',
    },
  });
});

// POST /reserve - Create a new reservation with a 15-minute hold
app.post('/reserve', async (c) => {
  try {
    const body = await c.req.json<{ seatId: string; userId?: string }>();

    if (!body.seatId) {
      return c.json({ error: 'seatId is required' }, 400);
    }

    const reservationId = crypto.randomUUID();

    // Start the workflow instance
    const instance = await c.env.RESERVATION_WORKFLOW.create({
      id: reservationId,
      params: {
        reservationId,
        seatId: body.seatId,
        userId: body.userId,
      },
    });

    // Get the initial status
    const status = await instance.status();

    return c.json({
      reservationId,
      seatId: body.seatId,
      status: 'held',
      message: 'Reservation created with 15-minute hold. Please confirm before expiration.',
      expiresIn: '15 minutes',
      workflowInstanceId: instance.id,
      workflowStatus: status,
    }, 201);
  } catch (error) {
    console.error('Error creating reservation:', error);
    return c.json({
      error: 'Failed to create reservation',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /confirm/:id - Confirm a reservation before expiration
app.post('/confirm/:id', async (c) => {
  try {
    const reservationId = c.req.param('id');

    if (!reservationId) {
      return c.json({ error: 'Reservation ID is required' }, 400);
    }

    // Get current reservation data from KV
    const currentData = await c.env.RESERVATIONS_KV.get(reservationId);

    if (!currentData) {
      return c.json({
        error: 'Reservation not found',
        reservationId,
      }, 404);
    }

    const reservationData: ReservationData = JSON.parse(currentData);

    // Check if reservation can be confirmed
    if (reservationData.status === 'confirmed') {
      return c.json({
        message: 'Reservation is already confirmed',
        reservation: reservationData,
      }, 200);
    }

    if (reservationData.status === 'expired') {
      return c.json({
        error: 'Reservation has expired and cannot be confirmed',
        reservation: reservationData,
      }, 410); // 410 Gone
    }

    if (reservationData.status !== 'held') {
      return c.json({
        error: `Reservation cannot be confirmed from status: ${reservationData.status}`,
        reservation: reservationData,
      }, 400);
    }

    // Check if the hold has expired (time-based check)
    const expiresAt = new Date(reservationData.expiresAt);
    if (new Date() > expiresAt) {
      // Update status to expired
      const expiredData: ReservationData = {
        ...reservationData,
        status: 'expired',
        expiredAt: new Date().toISOString(),
      };
      await c.env.RESERVATIONS_KV.put(reservationId, JSON.stringify(expiredData));

      return c.json({
        error: 'Reservation has expired (confirmation time exceeded)',
        reservation: expiredData,
      }, 410);
    }

    // Confirm the reservation
    const confirmedData: ReservationData = {
      ...reservationData,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    };

    await c.env.RESERVATIONS_KV.put(
      reservationId,
      JSON.stringify(confirmedData),
      { expirationTtl: 60 * 60 * 24 } // Keep for 24 hours
    );

    return c.json({
      message: 'Reservation confirmed successfully',
      reservation: confirmedData,
    }, 200);
  } catch (error) {
    console.error('Error confirming reservation:', error);
    return c.json({
      error: 'Failed to confirm reservation',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /reservation/:id - Get reservation status
app.get('/reservation/:id', async (c) => {
  try {
    const reservationId = c.req.param('id');

    if (!reservationId) {
      return c.json({ error: 'Reservation ID is required' }, 400);
    }

    // Get reservation data from KV
    const currentData = await c.env.RESERVATIONS_KV.get(reservationId);

    if (!currentData) {
      return c.json({
        error: 'Reservation not found',
        reservationId,
      }, 404);
    }

    const reservationData: ReservationData = JSON.parse(currentData);

    // Calculate time remaining if still held
    let timeRemaining: string | null = null;
    if (reservationData.status === 'held') {
      const expiresAt = new Date(reservationData.expiresAt);
      const now = new Date();
      const msRemaining = expiresAt.getTime() - now.getTime();

      if (msRemaining > 0) {
        const minutes = Math.floor(msRemaining / 60000);
        const seconds = Math.floor((msRemaining % 60000) / 1000);
        timeRemaining = `${minutes}m ${seconds}s`;
      } else {
        timeRemaining = 'expired';
      }
    }

    return c.json({
      reservation: reservationData,
      timeRemaining,
    }, 200);
  } catch (error) {
    console.error('Error getting reservation:', error);
    return c.json({
      error: 'Failed to get reservation',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /workflow/:id - Get workflow instance status (for debugging/monitoring)
app.get('/workflow/:id', async (c) => {
  try {
    const instanceId = c.req.param('id');

    if (!instanceId) {
      return c.json({ error: 'Workflow instance ID is required' }, 400);
    }

    const instance = await c.env.RESERVATION_WORKFLOW.get(instanceId);
    const status = await instance.status();

    return c.json({
      instanceId,
      status,
    }, 200);
  } catch (error) {
    console.error('Error getting workflow status:', error);
    return c.json({
      error: 'Failed to get workflow status',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default app;
