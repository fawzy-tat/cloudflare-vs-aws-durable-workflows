// Type declarations for AWS Durable Execution SDKs

declare module "@aws/durable-execution-sdk-js" {
    export function withDurableExecution<T, R>(
        handler: (event: T, context: DurableContext) => Promise<R>
    ): (event: T, context: DurableContext) => Promise<R>;

    export interface DurableContext {
        step<T>(fn: (stepContext: StepContext) => Promise<T>): Promise<T>;
        step<T>(name: string, fn: () => Promise<T>): Promise<T>;
        wait(options: { seconds: number }): Promise<void>;
        logger: Logger;
    }

    export interface StepContext {
        logger: Logger;
    }

    export interface Logger {
        info(message: string): void;
        error(message: string): void;
        warn(message: string): void;
    }
}

declare module "@aws/durable-execution-sdk-js-testing" {
    export class LocalDurableTestRunner {
        constructor(options: { handlerFunction: Function });

        static setupTestEnvironment(options?: { skipTime?: boolean }): Promise<void>;
        static teardownTestEnvironment(): Promise<void>;

        run(options: { payload: any }): Promise<TestResult>;
        reset(): void;

        getOperation(name: string): Operation;
        getOperationByIndex(index: number): Operation;
        getOperationByNameAndIndex(name: string, index: number): Operation;
        getOperationById(id: string): Operation;

        registerDurableFunction(name: string, handler: Function): this;
        registerFunction(name: string, handler: Function): this;
    }

    export class CloudDurableTestRunner {
        constructor(options: {
            functionName: string;
            client?: any;
            config?: {
                pollInterval?: number;
                invocationType?: InvocationType;
            };
        });

        run(options: { payload: any }): Promise<TestResult>;
        reset(): void;
        getOperation(name: string): Operation;
        getOperationByIndex(index: number): Operation;
    }

    export interface TestResult {
        getStatus(): "SUCCEEDED" | "FAILED" | "RUNNING";
        getResult(): any;
        getError(): any;
        getOperations(filter?: { status?: string }): Operation[];
        getHistoryEvents(): any[];
        getInvocations(): any[];
        print(columns?: { name?: boolean; status?: boolean; duration?: boolean }): void;
    }

    export interface Operation {
        getName(): string;
        getStatus(): string;
        getStartTimestamp(): string;
        getEndTimestamp(): string;

        waitForData(status?: WaitingOperationStatus): Promise<void>;

        getStepDetails(): { result: any; attempt?: number } | undefined;
        getContextDetails(): any;
        getCallbackDetails(): any;
        getWaitDetails(): { waitSeconds: number } | undefined;

        sendCallbackSuccess(result: any): Promise<void>;
        sendCallbackFailure(error: { errorMessage: string }): Promise<void>;
        sendCallbackHeartbeat(): Promise<void>;
    }

    export enum WaitingOperationStatus {
        STARTED = "STARTED",
        SUBMITTED = "SUBMITTED",
        COMPLETED = "COMPLETED",
    }

    export enum InvocationType {
        RequestResponse = "RequestResponse",
        Event = "Event",
    }
}
