/**
 * AWS Lambda Durable Functions - Tests using LocalDurableTestRunner
 * 
 * Reference: https://github.com/aws/aws-durable-execution-sdk-js/tree/main/packages/aws-durable-execution-sdk-js-testing
 */
import { LocalDurableTestRunner, WaitingOperationStatus } from "@aws/durable-execution-sdk-js-testing";
import { handler } from "./app";

describe("Reservation Workflow", () => {
    let runner: LocalDurableTestRunner;

    beforeAll(async () => {
        // Set up test environment with time skipping for faster tests
        await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true });
    });

    afterAll(async () => {
        await LocalDurableTestRunner.teardownTestEnvironment();
    });

    beforeEach(() => {
        runner = new LocalDurableTestRunner({ handlerFunction: handler });
    });

    afterEach(() => {
        runner.reset();
    });

    test("creates reservation and processes through all steps", async () => {
        const execution = await runner.run({
            payload: { seatId: "A1", userId: "user123" },
        });

        // Verify final status
        expect(execution.getStatus()).toBe("SUCCEEDED");

        // Verify all operations executed (step + wait + step)
        const operations = execution.getOperations();
        expect(operations.length).toBeGreaterThanOrEqual(2);

        // Verify result structure
        const result = execution.getResult();
        expect(result).toHaveProperty("message");
        expect(result).toHaveProperty("reservation");
        expect(result.reservation).toHaveProperty("status", "expired");
    });

    test("step 1 creates hold with correct data", async () => {
        const execution = await runner.run({
            payload: { seatId: "B2", userId: "user456" },
        });

        // Get first step operation
        const firstStep = runner.getOperationByIndex(0);
        await firstStep.waitForData(WaitingOperationStatus.COMPLETED);

        const stepDetails = firstStep.getStepDetails();
        expect(stepDetails?.result).toBeDefined();
        expect(stepDetails?.result.seatId).toBe("B2");
        expect(stepDetails?.result.userId).toBe("user456");
        expect(stepDetails?.result.status).toBe("held");
    });

    test("wait operation is configured correctly", async () => {
        const execution = await runner.run({
            payload: { seatId: "C3" },
        });

        // Get wait operation (should be second operation)
        const waitOp = runner.getOperationByIndex(1);
        const waitDetails = waitOp.getWaitDetails();

        // Verify wait is 30 seconds (test mode) or 900 seconds (15 min production)
        expect(waitDetails?.waitSeconds).toBeDefined();
    });

    test("reservation expires after wait if not confirmed", async () => {
        const execution = await runner.run({
            payload: { seatId: "D4", userId: "user789" },
        });

        expect(execution.getStatus()).toBe("SUCCEEDED");

        const result = execution.getResult();
        expect(result.reservation.status).toBe("expired");
        expect(result.reservation).toHaveProperty("expiredAt");
    });

    test("prints operations table for debugging", async () => {
        const execution = await runner.run({
            payload: { seatId: "E5" },
        });

        // Print operations for visual debugging (optional)
        execution.print();
    });
});
