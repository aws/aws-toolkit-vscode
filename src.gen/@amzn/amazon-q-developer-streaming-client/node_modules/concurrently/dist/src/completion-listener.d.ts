import * as Rx from 'rxjs';
import { CloseEvent, Command } from './command';
/**
 * Defines which command(s) in a list must exit successfully (with an exit code of `0`):
 *
 * - `first`: only the first specified command;
 * - `last`: only the last specified command;
 * - `all`: all commands.
 */
export declare type SuccessCondition = 'first' | 'last' | 'all';
/**
 * Provides logic to determine whether lists of commands ran successfully.
*/
export declare class CompletionListener {
    private readonly successCondition;
    private readonly scheduler?;
    constructor({ successCondition, scheduler }: {
        /**
         * How this instance will define that a list of commands ran successfully.
         * Defaults to `all`.
         *
         * @see {SuccessCondition}
         */
        successCondition?: SuccessCondition;
        /**
         * For testing only.
         */
        scheduler?: Rx.SchedulerLike;
    });
    private isSuccess;
    /**
     * Given a list of commands, wait for all of them to exit and then evaluate their exit codes.
     *
     * @returns A Promise that resolves if the success condition is met, or rejects otherwise.
     */
    listen(commands: Command[]): Promise<CloseEvent[]>;
}
