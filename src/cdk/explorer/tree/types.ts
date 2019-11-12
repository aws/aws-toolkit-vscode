/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents the CDK construct tree
 */
export interface ConstructTree {
    readonly version: string
    readonly tree: ConstructTreeEntity
}

/**
 * Represents a construct in the CDK construct tree.
 */
export interface ConstructTreeEntity {
    readonly id: string
    readonly path: string
    readonly children: { [key: string]: ConstructTreeEntity }
    readonly attributes?: { [key: string]: any }
}

/**
 * CloudFormation attributes in the construct tree will contain these keys
 * The keys are defined by convention and the prefix `aws:cdk:cloudformation`
 * indicates that the attribute is a property of a CloudFormation resource
 *
 */
export enum CfnResourceKeys {
    TYPE = 'aws:cdk:cloudformation:type',
    PROPS = 'aws:cdk:cloudformation:props'
}

/**
 * Attributes of a CDK construct
 */
export interface ConstructAttributes {
    readonly type: string
    readonly props: { [key: string]: any }
}
