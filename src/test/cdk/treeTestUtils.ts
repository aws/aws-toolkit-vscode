/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import { ConstructTree, ConstructTreeEntity } from '../../cdk/explorer/tree/types'

export async function saveCdkJson(cdkJsonPath: string) {
    const cdkJsonContent = '{ "app": "npx ts-node bin/demo-nov7.ts"}'

    await writeFile(cdkJsonPath, cdkJsonContent, 'utf8')
}

export function generateConstructTreeEntity(label: string, treePath: string, children?: boolean): ConstructTreeEntity {
    return {
        id: label,
        path: treePath,
        children: children ? generateTreeChildResource() : {},
    }
}

export function generateTreeChildResource(): { [key: string]: any } {
    return {
        Resource: {
            id: 'Resource',
            path: 'MyStack/MyQueue/Resource',
        },
    }
}

export function generateAttributes(): { [key: string]: any } {
    return {
        'aws:cdk:cloudformation:type': 'AWS::SNS::Topic',
        'aws:cdk:cloudformation:props': {
            topicName: 'CoolTopic',
        },
    }
}

export function getTreeWithNoStack(): ConstructTree {
    return {
        version: 'tree-0.1',
        tree: {
            id: 'App',
            path: '',
            children: {
                Tree: {
                    id: 'Tree',
                    path: 'Tree',
                },
            },
        },
    }
}

export function getTree(): ConstructTree {
    return {
        version: 'tree-0.1',
        tree: {
            id: 'App',
            path: '',
            children: {
                Tree: {
                    id: 'Tree',
                    path: 'Tree',
                },
                TestStack: {
                    id: 'TestStack',
                    path: 'TestStack',
                    children: {
                        MyQueue: {
                            id: 'MyQueue',
                            path: 'TestStack/MyQueue',
                            children: {
                                Resource: {
                                    id: 'Resource',
                                    path: 'TestStack/MyQueue/Resource',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::SQS::Queue',
                                        'aws:cdk:cloudformation:props': {
                                            visibilityTimeout: 300,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    }
}
