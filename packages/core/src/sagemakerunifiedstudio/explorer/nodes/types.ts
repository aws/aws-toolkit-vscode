/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Node delimiter for creating unique IDs
// eslint-disable-next-line @typescript-eslint/naming-convention
export const NODE_ID_DELIMITER = '/'

// eslint-disable-next-line @typescript-eslint/naming-convention
export const AWS_DATA_CATALOG = 'AwsDataCatalog'
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DATA_DEFAULT_IAM_CONNECTION_NAME_REGEXP = /^(project\.iam)|(default\.iam)$/
// eslint-disable-next-line @typescript-eslint/naming-convention, id-length
export const DATA_DEFAULT_LAKEHOUSE_CONNECTION_NAME_REGEXP = /^(project\.default_lakehouse)|(default\.catalog)$/
// eslint-disable-next-line @typescript-eslint/naming-convention, id-length
export const DATA_DEFAULT_ATHENA_CONNECTION_NAME_REGEXP = /^(project\.athena)|(default\.sql)$/
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DATA_DEFAULT_S3_CONNECTION_NAME_REGEXP = /^(project\.s3_default_folder)|(default\.s3)$/

// Database object types
export enum DatabaseObjects {
    EXTERNAL_TABLE = 'EXTERNAL_TABLE',
    VIRTUAL_VIEW = 'VIRTUAL_VIEW',
}

// Ref: https://docs.aws.amazon.com/athena/latest/ug/data-types.html
export const lakeHouseColumnTypes = {
    NUMERIC: ['TINYINT', 'SMALLINT', 'INT', 'INTEGER', 'BIGINT', 'FLOAT', 'REAL', 'DOUBLE', 'DECIMAL'],
    STRING: ['CHAR', 'STRING', 'VARCHAR', 'UUID'],
    TIME: ['DATE', 'TIMESTAMP', 'INTERVAL'],
    BOOLEAN: ['BOOLEAN'],
    BINARY: ['BINARY', 'VARBINARY'],
    COMPLEX: ['ARRAY', 'MAP', 'STRUCT', 'ROW', 'JSON'],
}

// Ref: https://docs.aws.amazon.com/redshift/latest/dg/c_Supported_data_types.html
export const redshiftColumnTypes = {
    NUMERIC: ['SMALLINT', 'INT2', 'INTEGER', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL', 'FLOAT', 'DOUBLE'],
    STRING: ['CHAR', 'CHARACTER', 'NCHAR', 'BPCHAR', 'VARCHAR', 'VARCHAR', 'VARYING', 'NVARCHAR', 'TEXT'],
    TIME: ['TIME', 'TIMETZ', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL'],
    BOOLEAN: ['BOOLEAN', 'BOOL'],
    BINARY: ['VARBYTE', 'VARBINARY', 'BINARY', 'VARYING'],
    COMPLEX: ['HLLSKETCH', 'SUPER', 'GEOMETRY', 'GEOGRAPHY'],
}

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
    S3_ACCESS_GRANT = 's3-access-grant',

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
    // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
    GLUE_VIEW = 'view',

    // Redshift-specific catalog types
    REDSHIFT_CATALOG = 'redshift-catalog',
    REDSHIFT_CATALOG_DATABASE = 'redshift-catalog-database',
}

/**
 * Connection types
 */
export enum ConnectionType {
    S3 = 'S3',
    REDSHIFT = 'REDSHIFT',
    ATHENA = 'ATHENA',
    GLUE = 'GLUE',
    LAKEHOUSE = 'LAKEHOUSE',
}

/**
 * Resource types for Redshift
 */
export enum ResourceType {
    DATABASE = 'DATABASE',
    CATALOG_DATABASE = 'CATALOG_DATABASE',
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
    CATALOG_COLUMN = 'CATALOG_COLUMN',
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
 * Client types for ClientStore
 */
export enum ClientType {
    S3Client = 'S3Client',
    S3ControlClient = 'S3ControlClient',
    SQLWorkbenchClient = 'SQLWorkbenchClient',
    GlueClient = 'GlueClient',
    GlueCatalogClient = 'GlueCatalogClient',
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

// eslint-disable-next-line @typescript-eslint/naming-convention
export const NO_DATA_FOUND_MESSAGE = '[No data found]'
