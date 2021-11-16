/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: add wizard telemetry code here
import { PromptResult } from '../ui/prompter'
import { ControlSignal } from './stateController'

/** Control signals allow for alterations of the normal wizard flow */
export class WizardControl {
    /** Forcibly exit a wizard, bypassing confirmation prompts. */
    public static ForceExit = new this(ControlSignal.Exit)
    /** Exits a wizard and executes a 'exit' prompt if available. */
    public static Exit = new this(ControlSignal.Exit)
    /** Goes back to the previous prompt. */
    public static Back = new this(ControlSignal.Back)
    /** Retries the current prompt. */
    public static Retry = new this(ControlSignal.Retry)

    private constructor(public readonly type: ControlSignal) {}

    public toString() {
        return `[WIZARD_CONTROL] ${this.type}`
    }

    /** Checks if the user response is 'valid' (i.e. not undefined and not a control signal) */
    public static isValidResponse<T>(response: PromptResult<T>): response is T {
        return response !== undefined && !(response instanceof WizardControl)
    }
}
