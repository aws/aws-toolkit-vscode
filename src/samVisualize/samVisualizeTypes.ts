/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Enumerates possible types of connections between resources.
 */
export enum LinkTypes {
    GetAtt = 'Fn::GetAtt',
    Sub = 'Fn::Sub',
    DependsOn = 'DependsOn',
    Ref = 'Ref',
}
