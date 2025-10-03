/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SageMaker Connection Summary interface
 */
export interface SageMakerConnectionSummary {
    name: string
    type: string
}

/**
 * Connection option type definition
 */
export interface ConnectionOption {
    label: string
    description: string
    magic: string
    language: string
    category: string
}

/**
 * Project option group type definition
 */
export interface ProjectOptionGroup {
    connection: string
    projects: string[]
}

/**
 * Project option type definition
 */
export interface ProjectOption {
    connection: string
    project: string
}

/**
 * Connection to project mapping type definition
 */
export interface ConnectionProjectMapping {
    connection: string
    projectOptions: ProjectOptionGroup[]
}

/**
 * Represents the state of a notebook cell's connection settings
 */
export interface CellState {
    connection?: string
    project?: string
    isUserSelection?: boolean
    originalMagicCommand?: string
    lastParsedContent?: string
}

/**
 * Maps connection types to their display properties
 */
export interface ConnectionTypeProperties {
    labels: string[]
    magic: string
    language: string
    category: string
}
