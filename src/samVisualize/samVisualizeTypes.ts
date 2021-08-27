/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Possible links between resources found when parsing a template.
 */
export enum TemplateLinkTypes {
    GetAtt = 'Fn::GetAtt',
    Sub = 'Fn::Sub',
    Ref = 'Ref',
    DependsOn = 'DependsOn',
}

/**
 * Possible link types between resources when rendered in a webview.
 */
export enum RenderedLinkTypes {
    DependsOn = 'DependsOn',
    // A general category to represent any intrinsic function. Includes GetAtt, Sub, and Ref.
    IntrinsicFunction = 'Intrinsic Function',
}

/**
 * Possible message types the webview can send to the extension
 */
export enum MessageTypes {
    ViewLogs = 'ViewLogs',
    NavigateFromGraph = 'NavigateFromGraph',
    NavigateFromTemplate = 'NavigateFromTemplate',
    ClearNodeFocus = 'ClearNodeFocus',
    UpdateVisualization = 'UpdateVisualization',
}
