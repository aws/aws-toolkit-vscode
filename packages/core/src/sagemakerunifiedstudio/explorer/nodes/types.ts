/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Node delimiter for creating unique IDs
// eslint-disable-next-line @typescript-eslint/naming-convention
export const NODE_ID_DELIMITER = '/'

/**
 * Node types for different resources
 */
export enum NodeType {
    // Common types
    CONNECTION = 'connection',
    ERROR = 'error',
    LOADING = 'loading',
    EMPTY = 'empty',

    // S3 types
    S3_BUCKET = 's3-bucket',
    S3_FOLDER = 'folder',
    S3_FILE = 'file',

    // Redshift types
    REDSHIFT_CLUSTER = 'redshift-cluster',
    REDSHIFT_DATABASE = 'database',
    REDSHIFT_SCHEMA = 'schema',
    REDSHIFT_TABLE = 'table',
    REDSHIFT_VIEW = 'view',
    REDSHIFT_FUNCTION = 'function',
    REDSHIFT_STORED_PROCEDURE = 'storedProcedure',
    REDSHIFT_COLUMN = 'column',
    REDSHIFT_CONTAINER = 'container',

    // Glue types
    GLUE_CATALOG = 'catalog',
    // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
    GLUE_DATABASE = 'database',
    // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
    GLUE_TABLE = 'table',
}

/**
 * Connection types
 */
export enum ConnectionType {
    S3 = 'S3',
    REDSHIFT = 'REDSHIFT',
    ATHENA = 'ATHENA',
    GLUE = 'GLUE',
}

/**
 * Resource types for Redshift
 */
export enum ResourceType {
    DATABASE = 'DATABASE',
    SCHEMA = 'SCHEMA',
    TABLE = 'TABLE',
    VIEW = 'VIEW',
    FUNCTION = 'FUNCTION',
    STORED_PROCEDURE = 'STORED_PROCEDURE',
    COLUMNS = 'COLUMNS',
    CATALOG = 'CATALOG',
    EXTERNAL_DATABASE = 'EXTERNAL_DATABASE',
    SHARED_DATABASE = 'SHARED_DATABASE',
    EXTERNAL_SCHEMA = 'EXTERNAL_SCHEMA',
    SHARED_SCHEMA = 'SHARED_SCHEMA',
    EXTERNAL_TABLE = 'EXTERNAL_TABLE',
    CATALOG_TABLE = 'CATALOG_TABLE',
    DATA_CATALOG_TABLE = 'DATA_CATALOG_TABLE',
}

/**
 * Node path information
 */
export interface NodePath {
    connection?: string
    bucket?: string
    key?: string
    catalog?: string
    database?: string
    schema?: string
    table?: string
    column?: string
    cluster?: string
    label?: string
    [key: string]: any
}

/**
 * Node data interface for tree nodes
 */
export interface NodeData {
    id: string
    nodeType: NodeType
    connectionType?: ConnectionType
    value?: any
    path?: NodePath
    parent?: any
    isContainer?: boolean
    children?: any[]
}

/**
 * Redshift deployment types
 */
export enum RedshiftType {
    Serverless = 'SERVERLESS',
    ServerlessDev = 'SERVERLESS_DEV',
    ServerlessQA = 'SERVERLESS_QA',
    Cluster = 'CLUSTER',
    ClusterDev = 'CLUSTER_DEV',
    ClusterQA = 'CLUSTER_QA',
}

/**
 * Authentication types for database integration connections
 */
export enum DatabaseIntegrationConnectionAuthenticationTypes {
    FEDERATED = '4',
    TEMPORARY_CREDENTIALS_WITH_IAM = '5',
    SECRET = '6',
    IDC_ENHANCED_IAM_CREDENTIALS = '8',
}

/**
 * Redshift service model URLs
 */
export const RedshiftServiceModelUrl = {
    REDSHIFT_SERVERLESS_URL: 'redshift-serverless.amazonaws.com',
    REDSHIFT_CLUSTER_URL: 'redshift.amazonaws.com',
}

/**
 * Node types that are always leaf nodes
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const LEAF_NODE_TYPES = [
    NodeType.S3_FILE,
    NodeType.REDSHIFT_COLUMN,
    NodeType.ERROR,
    NodeType.LOADING,
    NodeType.EMPTY,
]
