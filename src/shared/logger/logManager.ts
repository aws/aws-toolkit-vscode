/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitUntil } from '../utilities/timeoutUtils'

/**
 * @param logID  Unique ID assigned to a registered log
 * @param logMessage  A Promise to be resolved into the message written by the logger 
 */
export interface LogManagerRecord {
    logID: number,
    logMessage: Promise<string | undefined>,
}

/** 
 * The LogManager allows for the recording of a log's message after it has passed through a Logger class.
 */
export class LogManager {
    private idCounter: number = 1
    private logMap: { [logID: string]: string } = {}

    /**
     * @param logID  ID of the log to apply the message to
     * @param message  Final message of the log
     */
    public recordLog(logID: string, message: string) {
        this.logMap[logID] = message
    } 

    /**
     * Registering a log lets the manager know that it should be listening for a message
     * The logID should be written to the logger as meta data with key = "logID"
     * 
     * @param timeout  The number of milliseconds to wait for the message (default: 2000)
     * @param interval  The number of milliseconds to wait after a failed check (default: 100)
     * 
     * @returns  A record containining a unique ID and Promise
     */
    public registerLog(timeout: number = 2000, interval: number = 100): LogManagerRecord {
        const logID: number = this.idCounter++
        const messagePromise: Promise<string | undefined> = waitUntil(async () => { 
                if (this.logMap[logID] !== undefined) {
                    const msg: string = this.logMap[logID]
                    delete this.logMap[logID] // Delete the message from our dictionary since it's been recovered

                    return msg
                } 

                return undefined
            }, { timeout: timeout, interval: interval, truthy: false }
        )

        return { logID: logID, logMessage: messagePromise }
    }
}

let logManager: LogManager | undefined
/**
 * Currently generates only a single LogManager. Could be adapted to have multiple managers for multiple files.
 * @returns  Current log manager
 */
export function getLogManager(): LogManager {
    if (logManager === undefined) {
        logManager = new LogManager()
    }

    return logManager
}

/**
 * Register this function to a Transport's 'logged' event to parse out the resulting meta data and log ID
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
