/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Region } from '../../shared/regions/endpoints'

export class ConnectionParams {
    constructor(
        public readonly connectionType: ConnectionType,
        public database: string,
        public readonly warehouseIdentifier: string,
        public readonly warehouseType: RedshiftWarehouseType,
        public username?: string,
        public readonly region?: Region,
        public password?: string,
        public secret?: string
    ) {}
}

export enum ConnectionType {
    DatabaseUser = 'Database user name and password',
    SecretsManager = 'AWS Secrets Manager',
    TempCreds = 'Temporary credentials',
}

export enum RedshiftWarehouseType {
    PROVISIONED,
    SERVERLESS,
}
