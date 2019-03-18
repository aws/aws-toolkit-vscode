/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import { promisify } from 'util'

// interfaces & types
export type PathLike = fs.PathLike

export interface Stats extends fs.Stats {
    // fs.Stats is a class, so for easy mocking we code against an interface with the same shape.
}

// functions
export const access = promisify(fs.access)

export const mkdir = promisify(fs.mkdir)

export const mkdtemp = promisify(fs.mkdtemp)

export const readFile = promisify(fs.readFile)

export const readdir = promisify(fs.readdir)

export const rename = promisify(fs.rename)

export const stat = promisify(fs.stat)

export const unlink = promisify(fs.unlink)

export const writeFile = promisify(fs.writeFile)
