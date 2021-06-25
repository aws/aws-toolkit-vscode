/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rule } from 'eslint'
import MochaArrow from './lib/rules/no-mocha-arrows'

type Rules = {
    [key: string]: Rule.RuleModule
}

const rules: Rules = {
    'no-mocha-arrows': MochaArrow,
}

export { rules }
