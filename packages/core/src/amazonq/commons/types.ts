/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export enum FollowUpTypes {
    // UnitTestGeneration
    ViewDiff = 'ViewDiff',
    AcceptCode = 'AcceptCode',
    RejectCode = 'RejectCode',
    BuildAndExecute = 'BuildAndExecute',
    ModifyCommands = 'ModifyCommands',
    SkipBuildAndFinish = 'SkipBuildAndFinish',
    InstallDependenciesAndContinue = 'InstallDependenciesAndContinue',
    ContinueBuildAndExecute = 'ContinueBuildAndExecute',
    ViewCodeDiffAfterIteration = 'ViewCodeDiffAfterIteration',
    // FeatureDev
    GenerateCode = 'GenerateCode',
    InsertCode = 'InsertCode',
    ProvideFeedbackAndRegenerateCode = 'ProvideFeedbackAndRegenerateCode',
    Retry = 'Retry',
    ModifyDefaultSourceFolder = 'ModifyDefaultSourceFolder',
    DevExamples = 'DevExamples',
    NewTask = 'NewTask',
    CloseSession = 'CloseSession',
    SendFeedback = 'SendFeedback',
    // Doc
    CreateDocumentation = 'CreateDocumentation',
    ChooseFolder = 'ChooseFolder',
    UpdateDocumentation = 'UpdateDocumentation',
    SynchronizeDocumentation = 'SynchronizeDocumentation',
    EditDocumentation = 'EditDocumentation',
    AcceptChanges = 'AcceptChanges',
    RejectChanges = 'RejectChanges',
    MakeChanges = 'MakeChanges',
    ProceedFolderSelection = 'ProceedFolderSelection',
    CancelFolderSelection = 'CancelFolderSelection',
}
