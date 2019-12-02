// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

// TODO: This is fragile. Very fragle. But it is necessary to get Schemas service launched, and we've evaluated all other tradeoffs
// This will be done on the server-side as soon as we can, but for now the client needs to do this
class SchemaCodeGenUtils {
    companion object {
        private val SCHEMA_PACKAGE_PREFIX = "schema"
        private val AWS = "aws"
        private val PARTNER = "partner"
        private val AWS_PARTNER_PREFIX = "$AWS.$PARTNER-" // dash suffix because of 3p partner registry name format
        private val AWS_EVENTS_PREFIX = "$AWS." // . suffix because of 1p event registry schema format

        fun buildSchemaPackageName(schemaName: String): String {
            val builder = CodeGenPackageBuilder()
            builder.append(SCHEMA_PACKAGE_PREFIX)
            buildPackageName(builder, schemaName)
            return builder.toString()
        }

        private fun buildPackageName(builder: CodeGenPackageBuilder, schemaName: String) {
            if (isAwsPartnerEvent(schemaName)) {
                buildPartnerEventPackageName(builder, schemaName)
            } else if (isAwsEvent(schemaName)) {
                buildAwsEventPackageName(builder, schemaName)
            } else {
                buildCustomPackageName(builder, schemaName)
            }
        }

        private fun isAwsPartnerEvent(schemaName: String): Boolean = schemaName.startsWith(AWS_PARTNER_PREFIX)

        private fun buildPartnerEventPackageName(builder: CodeGenPackageBuilder, schemaName: String) {
            val partnerSchemaString = schemaName.substring(AWS_PARTNER_PREFIX.length)

            builder
                .append(AWS)
                .append(PARTNER)
                .append(partnerSchemaString)
        }

        private fun isAwsEvent(name: String): Boolean = name.startsWith(AWS_EVENTS_PREFIX)

        private fun buildAwsEventPackageName(builder: CodeGenPackageBuilder, schemaName: String) {
            val awsEventSchemaParts = schemaName.split(".")
            for (part in awsEventSchemaParts) {
                builder.append(part)
            }
        }

        private fun buildCustomPackageName(builder: CodeGenPackageBuilder, schemaName: String) = builder.append(schemaName)
    }

    class CodeGenPackageBuilder {
        private val builder: StringBuilder = StringBuilder()

        fun append(segment: String): CodeGenPackageBuilder {
            if (builder.length > 0) {
                builder.append(IdentifierFormatter.PACKAGE_SEPARATOR)
            }
            builder.append(IdentifierFormatter.toValidIdentifier(segment.toLowerCase()))
            return this
        }

        override fun toString(): String = builder.toString()
    }

    class IdentifierFormatter {
        companion object {
            private val POTENTIAL_PACKAGE_SEPARATOR = "@"

            private val NOT_VALID_IDENTIFIER_CHARACTER = "[^a-zA-Z0-9_$POTENTIAL_PACKAGE_SEPARATOR]"
            private val NOT_VALID_IDENTIFIER_REGEX = Regex(NOT_VALID_IDENTIFIER_CHARACTER)

            val PACKAGE_SEPARATOR = "."

            private val UNDERSCORE = "_"

            fun toValidIdentifier(name: String): String =
                name
                    .replace(NOT_VALID_IDENTIFIER_REGEX, UNDERSCORE)
                    .replace(POTENTIAL_PACKAGE_SEPARATOR, PACKAGE_SEPARATOR)
        }
    }
}
