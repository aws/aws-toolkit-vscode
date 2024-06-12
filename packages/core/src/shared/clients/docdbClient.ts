/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import _ from 'lodash'
import { AWSError, DocDB, DocDBElastic } from 'aws-sdk'
import { getLogger } from '../logger'
import { InterfaceNoSymbol } from '../utilities/tsUtils'

export type DocumentDBClient = InterfaceNoSymbol<DefaultDocumentDBClient>

export class DefaultDocumentDBClient {
    public constructor(public readonly regionCode: string) {}
}
