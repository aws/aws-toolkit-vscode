/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShortAnswer, ShortAnswerReference } from '../../../codewhisperer'
import { TestGenerationJob } from '../../../codewhisperer/client/codewhispereruserclient'

export enum ConversationState {
    IDLE,
    JOB_SUBMITTED,
    WAITING_FOR_INPUT,
    WAITING_FOR_BUILD_COMMMAND_INPUT,
    WAITING_FOR_REGENERATE_INPUT,
    IN_PROGRESS,
}

export enum BuildStatus {
    SUCCESS,
    FAILURE,
    CANCELLED,
}

export class Session {
    // Used to keep track of whether or not the current session is currently authenticating/needs authenticating
    public isAuthenticating: boolean = false

    // A tab may or may not be currently open
    public tabID: string | undefined

    // This is unique per each test generation cycle
    public testGenerationJobGroupName: string | undefined = undefined
    public listOfTestGenerationJobId: string[] = []
    public startTestGenerationRequestId: string | undefined = undefined
    public testGenerationJob: TestGenerationJob | undefined

    // Start Test generation
    public conversationState: ConversationState = ConversationState.IDLE
    public shortAnswer: ShortAnswer | undefined
    public sourceFilePath: string = ''
    public generatedFilePath: string = ''
    public projectRootPath: string = ''
    public fileLanguage: string | undefined = 'plaintext'
    public stopIteration: boolean = false

    // Telemetry
    public testGenerationStartTime: number = 0
    public hasUserPromptSupplied: boolean = false
    public isCodeBlockSelected: boolean = false
    public srcPayloadSize: number = 0
    public srcZipFileSize: number = 0
    public artifactsUploadDuration: number = 0
    public numberOfTestsGenerated: number = 0
    public linesOfCodeGenerated: number = 0
    public linesOfCodeAccepted: number = 0
    public charsOfCodeGenerated: number = 0
    public charsOfCodeAccepted: number = 0
    public latencyOfTestGeneration: number = 0

    // TODO: Take values from ShortAnswer or TestGenerationJob
    // Build loop
    public buildStatus: BuildStatus = BuildStatus.SUCCESS
    public updatedBuildCommands: string[] | undefined = undefined
    public testCoveragePercentage: number = 90
    public isInProgress: boolean = false
    public acceptedJobId = ''
    public references: ShortAnswerReference[] = []

    constructor() {}

    public isTabOpen(): boolean {
        return this.tabID !== undefined
    }
}
