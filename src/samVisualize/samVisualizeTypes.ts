/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Enumerates possible types of connections between resources.
 */
export enum LinkTypes {
    GetAtt = 'Fn::GetAtt',
    Sub = 'Fn::Sub',
    Ref = 'Ref',
    DependsOn = 'DependsOn',
    // A general category to represent any intrinsic function. Includes GetAtt, Sub, and Ref.
    IntrinsicFunction = 'Intrinsic Function',
}
