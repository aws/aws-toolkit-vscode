/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'

export interface InsertSnippetCommandInput {
    snippetPrefix: string
    snippetLanguage: string
}

/**
 * Records telemetry after a snippet is inserted.
 */
export async function insertSnippetCommand(input: InsertSnippetCommandInput): Promise<void> {
    recordSnippetInsert(input)
}

function recordSnippetInsert(input: InsertSnippetCommandInput) {
    // TODO add telemetry
    getLogger().info(`Inserted snippet: %O`, input)
}
