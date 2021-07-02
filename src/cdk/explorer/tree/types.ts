/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The CDK construct tree is the hierarchy of a CDK application. Every time a CDK application
 * is built and `cdk synth` is called on it from the CLI, the construct tree is written to a
 * file named `tree.json`.
 *
 * The tree includes all of the resources that are encapsulated by the CDK.
 * A motivation for sharing this tree is to provide a design-time view of the resources that are
 * contained with a CDK application
 *
 * The intial RFC around the construct tree can be found here:
 * https://github.com/aws/aws-cdk/pull/4053
 *
 * @attribute version - version of the tree to leverage if the spec changes
 * @attribute tree - every construct in the tree adheres to this schema
 */
export interface ConstructTree {
    readonly version: string
    readonly tree: ConstructTreeEntity
}

/**
 * Represents a construct in the CDK construct tree.
 * The tree is produced by a construct called `Tree` which visits every construct in an application
 * and adds an entry for it.
 *
 * @attribute id - identifier in the tree. At the top level every CDK application will have a construct called "App"
 * The children of "App" will include 'Tree'
 * @attribute path - path in the tree. All application start with a path of ''. The path represents the depth of a
 * construct in a CDK application (i.e Apps contain Stacks which contain Resource - the path would be Stack/Resource)
 * @attribute children - All of the chidren encapsulated by the current level in the tree. Children are keyed on their ids
 * @attribute attributes - An Attribute bag that constructs can voluntarily contribute towards. All CloudFormation
 * resources contribute their type and properties. Attributes will be keyed on convention. i.e. CloudFormation properties
 * are prefixed `aws:cdk:cloudformation`
 */
export interface ConstructTreeEntity {
    readonly id: string
    readonly path: string
    readonly children?: { [key: string]: ConstructTreeEntity }
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
    PROPS = 'aws:cdk:cloudformation:props',
}

/**
 * Attributes of a CDK construct
 */
export interface ConstructAttributes {
    readonly type: string
    readonly props: ConstructProps
}

/**
 * Represents a bag of properties
 * Construct properties can be arrays, objects, strings, or boolean
 */
export interface ConstructProps {
    readonly props: { [key: string]: any }
}
