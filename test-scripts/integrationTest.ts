/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'

process.env.CODE_TESTS_PATH = join(process.cwd(), 'out', 'src', 'integrationTest')
process.env.CODE_EXTENSIONS_PATH = process.cwd()

// Launch the VS Code Test Script
// tslint:disable-next-line: no-var-requires
require('../node_modules/vscode/bin/test')
