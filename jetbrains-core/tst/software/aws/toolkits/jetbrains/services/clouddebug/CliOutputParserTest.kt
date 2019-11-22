// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.slf4j.event.Level

class CliOutputParserTest {

    @Test
    fun parseLogEntries_handlesDifferentLevels() {
        val debug = "[12:29:04-D copy-1571254144] Dispatcher: ping was successful: Pong!"
        val info = "[12:29:04-I copy-1571254144] Copying data from source"
        val error = "[14:05:56-E exec-1571259956] Decoding exec output failed"

        assertThat(CliOutputParser.parseLogEvent(debug)).isEqualTo(LogEvent("Dispatcher: ping was successful: Pong!", Level.DEBUG))
        assertThat(CliOutputParser.parseLogEvent(info)).isEqualTo(LogEvent("Copying data from source", Level.INFO))
        assertThat(CliOutputParser.parseLogEvent(error)).isEqualTo(LogEvent("Decoding exec output failed", Level.ERROR))
    }

    @Test
    fun parseLogEntries_canHandleMultiLineEvents() {
        val error = "[12:29:04-E exec-1571254144] Decoding exec output failed\ncompat.c(61) [sender=2.6.9]"
        assertThat(CliOutputParser.parseLogEvent(error)).isEqualTo(LogEvent("Decoding exec output failed\ncompat.c(61) [sender=2.6.9]", Level.ERROR))
    }

    @Test
    fun parseLogEntries_unexpectedStringIsHandled() {
        val randomLogOutput = "Hello World"
        assertThat(CliOutputParser.parseLogEvent(randomLogOutput)).isEqualTo(LogEvent("Hello World", null))
    }

    @Test
    fun parseLogEntries_colorCodesAreIgnored() {
        val logOutput = "\u001B[0;31m[16:53:54-E exec-1571270034]\u001B[0m Decoding exec output failed with:error from daemon in stream"
        assertThat(CliOutputParser.parseLogEvent(logOutput)).isEqualTo(LogEvent("Decoding exec output failed with:error from daemon in stream", Level.ERROR))
    }
}
