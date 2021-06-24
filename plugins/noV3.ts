/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ts from 'typescript'
import * as fs from 'fs-extra'



module.exports = {
    create: function(context: any) {
        return {
            Program: function(node: ts.Node) {

            }
        }
    }
}