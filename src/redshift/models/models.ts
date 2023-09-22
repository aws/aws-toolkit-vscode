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
        public readonly username?: string,
        public readonly region?: Region,
        public readonly password?: string,
        public readonly secret?: string
    ) {}
}

export enum ConnectionType {
    DatabaseUser = 'Database user name and Password',
    SecretsManager = 'AWS Secrets Manager',
    TempCreds = 'Temporary credentails',
}

export enum RedshiftWarehouseType {
    PROVISIONED,
    SERVERLESS,
}
