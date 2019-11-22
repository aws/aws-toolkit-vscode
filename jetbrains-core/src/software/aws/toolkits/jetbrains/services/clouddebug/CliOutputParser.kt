// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.slf4j.event.Level
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.splitNoBlank

object CliOutputParser {
    private val LOG_EVENT_REGEX = "\\W*(?:\\[.*m)?\\[\\d+:\\d+:\\d+-([A-Z])\\W\\S+]\\W*(?:\\[0m)?\\W(.*)".toRegex(RegexOption.DOT_MATCHES_ALL)
    private val LOG = getLogger<CliOutputParser>()
    private val objectMapper: ObjectMapper by lazy {
        jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    }

    fun parseErrorOutput(output: String): ErrorOutput? = parseWithLogging(output.splitNoBlank('\n').last()) // Take the last line of the output

    fun parseInstrumentResponse(output: String): InstrumentResponse? = parseWithLogging(output)

    fun parseLogEvent(event: String): LogEvent {
        val match = LOG_EVENT_REGEX.matchEntire(event.trimStart()) ?: return LogEvent(event, null)
        val (rawLevel, text) = match.destructured
        val level = when (rawLevel.toUpperCase()) {
            "E" -> Level.ERROR
            "D" -> Level.DEBUG
            "W" -> Level.WARN
            "I" -> Level.INFO
            else -> null
        }
        return LogEvent(text, level)
    }

    private inline fun <reified T> parseWithLogging(str: String): T? = try {
        objectMapper.readValue(str)
    } catch (e: Exception) {
        LOG.error(e) { "Failed to parse response: $str" }
        null
    }
}

fun String.asLogEvent(): LogEvent = CliOutputParser.parseLogEvent(this)

data class ErrorOutput(val errors: List<String>)
data class InstrumentResponse(val target: String)
data class LogEvent(val text: String, val level: Level?)

/* TODO uncomment this when the cli conforms to the contract
  data class InstrumentResponse(val targets: List<Target>)
  data class Target(val name: String, val target: String)
*/
