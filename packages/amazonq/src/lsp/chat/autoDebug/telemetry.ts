/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry } from 'aws-core-vscode/telemetry'

/**
 * Auto Debug command types for telemetry tracking
 */
export type AutoDebugCommandType = 'fixWithQ' | 'fixAllWithQ' | 'explainProblem'

/**
 * Telemetry interface for Auto Debug feature
 * Tracks usage counts and success rates for the three main commands
 */
export interface AutoDebugTelemetry {
    /**
     * Record when an auto debug command is invoked
     */
    recordCommandInvocation(commandType: AutoDebugCommandType, problemCount?: number): void

    /**
     * Record when an auto debug command succeeds
     */
    recordCommandSuccess(commandType: AutoDebugCommandType, problemCount?: number): void

    /**
     * Record when an auto debug command fails
     */
    recordCommandFailure(commandType: AutoDebugCommandType, error?: string, problemCount?: number): void
}

/**
 * Implementation of Auto Debug telemetry tracking
 */
export class AutoDebugTelemetryImpl implements AutoDebugTelemetry {
    recordCommandInvocation(commandType: AutoDebugCommandType, problemCount?: number): void {
        telemetry.amazonq_autoDebugCommand.emit({
            amazonqAutoDebugCommandType: commandType,
            amazonqAutoDebugAction: 'invoked',
            amazonqAutoDebugProblemCount: problemCount,
            result: 'Succeeded',
        })
    }

    recordCommandSuccess(commandType: AutoDebugCommandType, problemCount?: number): void {
        telemetry.amazonq_autoDebugCommand.emit({
            amazonqAutoDebugCommandType: commandType,
            amazonqAutoDebugAction: 'completed',
            amazonqAutoDebugProblemCount: problemCount,
            result: 'Succeeded',
        })
    }

    recordCommandFailure(commandType: AutoDebugCommandType, error?: string, problemCount?: number): void {
        telemetry.amazonq_autoDebugCommand.emit({
            amazonqAutoDebugCommandType: commandType,
            amazonqAutoDebugAction: 'completed',
            amazonqAutoDebugProblemCount: problemCount,
            result: 'Failed',
            reason: error ? 'Error' : 'Unknown',
            reasonDesc: error?.substring(0, 200), // Truncate to 200 chars as recommended
        })
    }
}

/**
 * Global instance of auto debug telemetry
 */
export const autoDebugTelemetry: AutoDebugTelemetry = new AutoDebugTelemetryImpl()
