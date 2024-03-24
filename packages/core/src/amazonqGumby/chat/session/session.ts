/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TransformationCandidateProject } from '../../../codewhisperer/service/transformByQHandler'

export enum ConversationState {
    TRANSFORMATION_INITIATED,
    PROMPT_JAVA_HOME,
    COMPILING,
    JOB_SUBMITTED,
}

export interface ProjectDetails {
    pathToJavaHome: string
}

export class Session {
    // Used to keep track of whether or not the current session is currently authenticating/needs authenticating
    public isAuthenticating: boolean = false

    // A tab may or may not be currently open
    public tabID: string | undefined

    public conversationState: ConversationState = ConversationState.TRANSFORMATION_INITIATED

    // If the user is prompted to provide more details about their project, it is stored here for use in future transformations
    public projectDetails: ProjectDetails | undefined

    public candidateProjects: Map<string, TransformationCandidateProject> = new Map<
        string,
        TransformationCandidateProject
    >()

    constructor() {}

    public isTabOpen(): boolean {
        return this.tabID !== undefined
    }

    public updateCandidateProjects(newCandidateProjects: TransformationCandidateProject[]) {
        this.candidateProjects = new Map<string, TransformationCandidateProject>()
        newCandidateProjects.map(candidateProject => {
            this.candidateProjects.set(candidateProject.path, candidateProject)
        })
    }
}
