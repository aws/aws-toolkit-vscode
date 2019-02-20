/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const access = promisify(fs.access)

export type PathLike = fs.PathLike

export const accessAsync = async (pathLike: fs.PathLike): Promise<void> => {
    return access(pathLike)
}

export const mkdirAsync = promisify(fs.mkdir)

const mkdtemp = promisify(fs.mkdtemp)

export const getTempDirPath = (prefix: string = 'vsctk') => {
    return path.join(
        os.type() === 'Darwin' ? '/tmp' : os.tmpdir(),
        prefix
    )
}

export const  mkdtempAsync = async (prefix?: string) => {
    return mkdtemp(getTempDirPath(prefix))
}

const readdir = promisify(fs.readdir)
export const readdirAsync = async (pathLike: fs.PathLike): Promise<string[]> => {
    return readdir(pathLike)
}

const readFile = promisify(fs.readFile)
export const readFileAsync = async (pathLike: fs.PathLike, encoding?: string): Promise<string | Buffer> => {
    return readFile(pathLike, { encoding })
}

export interface Stats extends fs.Stats {
    // fs.Stats is a class, so for easy mocking we code against an interface with the same shape.
}

const stat = promisify(fs.stat)
export const statAsync = async (pathLike: fs.PathLike): Promise<Stats> => {
    return stat(pathLike)
}

export const writeFileAsync = promisify(fs.writeFile)
