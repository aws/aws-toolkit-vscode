/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConnectionTypeProperties } from './types'

export const Constants = {
    // Connection types
    CONNECTION_TYPE_EMR_EC2: 'SPARK_EMR_EC2',
    CONNECTION_TYPE_EMR_SERVERLESS: 'SPARK_EMR_SERVERLESS',
    CONNECTION_TYPE_GLUE: 'SPARK_GLUE',
    CONNECTION_TYPE_SPARK: 'SPARK',
    CONNECTION_TYPE_REDSHIFT: 'REDSHIFT',
    CONNECTION_TYPE_ATHENA: 'ATHENA',
    CONNECTION_TYPE_IAM: 'IAM',

    // UI labels and placeholders
    CONNECTION_QUICK_PICK_LABEL_PLACEHOLDER: 'Select Connection',
    CONNECTION_STATUS_BAR_ITEM_LABEL: 'Select Connection',
    CONNECTION_STATUS_BAR_ITEM_ICON: '$(plug)',
    DEFAULT_CONNECTION_STATUS_BAR_ITEM_LABEL: 'Connection',
    PROJECT_QUICK_PICK_LABEL_PLACEHOLDER: 'Select Compute',
    PROJECT_STATUS_BAR_ITEM_LABEL: 'Select Compute',
    PROJECT_STATUS_BAR_ITEM_ICON: '$(server)',
    DEFAULT_PROJECT_STATUS_BAR_ITEM_LABEL: 'Compute',
    CONNECTION_QUICK_PICK_ORDER: ['Local Python', 'PySpark', 'ScalaSpark', 'SQL'] as const,

    // Command IDs
    CONNECTION_COMMAND: 'aws.smus.connectionmagics.selectConnection',
    PROJECT_COMMAND: 'aws.smus.connectionmagics.selectProject',

    // Magic string literals
    LOCAL_PYTHON: 'Local Python',
    PYSPARK: 'PySpark',
    SCALA_SPARK: 'ScalaSpark',
    SQL: 'SQL',
    MAGIC_PREFIX: '%%',
    LOCAL_MAGIC: '%%local',
    NAME_FLAG_LONG: '--name',
    NAME_FLAG_SHORT: '-n',
    SAGEMAKER_CONNECTION_METADATA_KEY: 'sagemakerConnection',
    MARKDOWN_LANGUAGE: 'markdown',
    PROJECT_PYTHON: 'project.python',
    PROJECT_SPARK_COMPATIBILITY: 'project.spark.compatibility',
} as const

/**
 * Maps connection types to their display properties
 */
export const connectionTypePropertiesMap: Record<string, ConnectionTypeProperties> = {
    [Constants.CONNECTION_TYPE_GLUE]: {
        labels: ['PySpark', 'SQL'], // Glue supports both PySpark and SQL
        magic: '%%pyspark',
        language: 'python',
        category: 'spark',
    },
    [Constants.CONNECTION_TYPE_EMR_EC2]: {
        labels: ['PySpark', 'SQL'], // EMR supports both PySpark and SQL
        magic: '%%pyspark',
        language: 'python',
        category: 'spark',
    },
    [Constants.CONNECTION_TYPE_EMR_SERVERLESS]: {
        labels: ['PySpark', 'SQL'], // EMR supports both PySpark and SQL
        magic: '%%pyspark',
        language: 'python',
        category: 'spark',
    },
    [Constants.CONNECTION_TYPE_REDSHIFT]: {
        labels: ['SQL'], // Redshift only supports SQL
        magic: '%%sql',
        language: 'sql',
        category: 'sql',
    },
    [Constants.CONNECTION_TYPE_ATHENA]: {
        labels: ['SQL'], // Athena only supports SQL
        magic: '%%sql',
        language: 'sql',
        category: 'sql',
    },
}

/**
 * Maps connection labels to their display properties
 */
export const connectionLabelPropertiesMap: Record<
    string,
    { description: string; magic: string; language: string; category: string }
> = {
    PySpark: {
        description: 'Python with Spark',
        magic: '%%pyspark',
        language: 'python',
        category: 'spark',
    },
    SQL: {
        description: 'SQL Query',
        magic: '%%sql',
        language: 'sql',
        category: 'sql',
    },
    ScalaSpark: {
        description: 'Scala with Spark',
        magic: '%%scalaspark',
        language: 'python', // Scala is not a supported language mode, defaulting to Python
        category: 'spark',
    },
    'Local Python': {
        description: 'Python',
        magic: '%%local',
        language: 'python',
        category: 'python',
    },
    IAM: {
        description: 'IAM Connection',
        magic: '%%iam',
        language: 'python',
        category: 'iam',
    },
}

/**
 * Maps connection types to their platform display names for grouping
 */
export const connectionTypeToComputeNameMap: Record<string, string> = {
    [Constants.CONNECTION_TYPE_GLUE]: 'Glue',
    [Constants.CONNECTION_TYPE_REDSHIFT]: 'Redshift',
    [Constants.CONNECTION_TYPE_ATHENA]: 'Athena',
    [Constants.CONNECTION_TYPE_EMR_EC2]: 'EMR EC2',
    [Constants.CONNECTION_TYPE_EMR_SERVERLESS]: 'EMR Serverless',
}

/**
 * Maps magic commands to their corresponding connection types
 */
export const magicCommandToConnectionMap: Record<string, string> = {
    '%%spark': 'PySpark',
    '%%pyspark': 'PySpark',
    '%%scalaspark': 'ScalaSpark',
    '%%local': 'Local Python',
    '%%sql': 'SQL',
} as const

/**
 * Default project names for each connection type
 */
export const defaultProjectsByConnection: Record<string, readonly string[]> = {
    'Local Python': ['project.python'],
    PySpark: ['project.spark.compatibility'],
    ScalaSpark: ['project.spark.compatibility'],
    SQL: ['project.spark.compatibility'],
} as const
