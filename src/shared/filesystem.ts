/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import { promisify } from 'util'

export type PathLike = fs.PathLike

export const access = promisify(fs.access)

export const mkdir = promisify(fs.mkdir)

export const readFile = promisify(fs.readFile)

export const readdir = promisify(fs.readdir)

export interface Stats extends fs.Stats {
    // fs.Stats is a class, so for easy mocking we code against an interface with the same shape.
}

const _stat = promisify(fs.stat)
export const stat = async (pathLike: fs.PathLike): Promise<Stats> => {
    return _stat(pathLike)
}

export const writeFile = promisify(fs.writeFile)

export const mkdtemp = promisify(fs.mkdtemp)
