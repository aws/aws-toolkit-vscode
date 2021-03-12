/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitUntil } from '../utilities/timeoutUtils'

export interface LogManagerRecord {
    logID: number,
    logMessage: Promise<string | undefined>,
}

/** 
 * The LogManager allows for the recording of a log's message after it has passed through the Logger class.
 * Normally after logging, you do not know what exactly has been logged into the file. With this class,
 * you can request a log ID, write to the logger, then wait for the promise to be resolved into the final message.
 *  
 */
export class LogManager {
    private idCounter: number = 1
    private logMap: { [logID: string]: string | undefined } = {}

    public recordLog(logID: string, message: string) {
        this.logMap[logID] = message
    } 

    public registerLog(): LogManagerRecord {
        const logID: number = this.idCounter++
        const messagePromise: Promise<string | undefined> = waitUntil(async () => this.logMap[logID], { timeout: 2000, interval: 100, truthy: false })

        return { logID: logID, logMessage: messagePromise }
    }
}

let logManager: LogManager | undefined
export function getLogManager(): LogManager {
    if (logManager === undefined) {
        logManager = new LogManager()
    }

    return logManager
}

/**
 * Register this function to a Transport's event to parse out the resulting meta data and log ID
 * Immediately records this log into the LogManager after parsing
 * 
 * @param obj  Object passed from the event
 */
export function parseLogObject(obj: any): void {
    const logID: string | undefined = obj.logID
    const symbols: symbol[] = Object.getOwnPropertySymbols(obj)
    const messageSymbol: symbol | undefined = symbols.find((s: symbol) => s.toString() === "Symbol(message)")

    if (logID && messageSymbol) {
        getLogManager().recordLog(logID, obj[messageSymbol])
    }
}
