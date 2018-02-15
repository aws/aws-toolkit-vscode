package software.aws.toolkits.jetbrains.utils

import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

class DateUtils {
    companion object {
        @JvmStatic
        fun formatDate(epochMills: Long): String {
            val instant = Instant.ofEpochMilli(epochMills)

            return DateTimeFormatter.RFC_1123_DATE_TIME.format(ZonedDateTime.ofInstant(instant, ZoneOffset.UTC))
        }
    }
}