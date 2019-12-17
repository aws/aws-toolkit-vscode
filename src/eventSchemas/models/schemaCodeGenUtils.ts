/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: This is fragile. Very fragile. But it is necessary to get Schemas service launched, and we've evaluated all other tradeoffs
// This will be done on the server-side as soon as we can, but for now the client needs to do this
export class SchemaCodeGenUtils {
    private readonly SCHEMA_PACKAGE_PREFIX = 'schema'
    private readonly AWS = 'aws'
    private readonly PARTNER = 'partner'
    private readonly AWS_PARTNER_PREFIX = `${this.AWS}.${this.PARTNER}-` // dash suffix because of 3p partner registry name format
    private readonly AWS_EVENTS_PREFIX = `${this.AWS}.` // . suffix because of 1p event registry schema format

    public buildSchemaPackageName(schemaName: string) {
        const builder = new CodeGenPackageBuilder()
        builder.append(this.SCHEMA_PACKAGE_PREFIX)
        this.buildPackageName(builder, schemaName)

        return builder.getBuilder()
    }

    private buildPackageName(builder: CodeGenPackageBuilder, schemaName: string) {
        if (this.isAwsPartnerEvent(schemaName)) {
            this.buildPartnerEventPackageName(builder, schemaName)
        } else if (this.isAwsEvent(schemaName)) {
            this.buildAwsEventPackageName(builder, schemaName)
        } else {
            this.buildCustomPackageName(builder, schemaName)
        }
    }

    private isAwsPartnerEvent(schemaName: string): Boolean {
        return schemaName.startsWith(this.AWS_PARTNER_PREFIX)
    }

    private buildPartnerEventPackageName(builder: CodeGenPackageBuilder, schemaName: string) {
        const partnerSchemaString = schemaName.substring(this.AWS_PARTNER_PREFIX.length)

        builder
            .append(this.AWS)
            .append(this.PARTNER)
            .append(partnerSchemaString)
    }

    private isAwsEvent(name: string): Boolean {
        return name.startsWith(this.AWS_EVENTS_PREFIX)
    }

    private buildAwsEventPackageName(builder: CodeGenPackageBuilder, schemaName: string) {
        const awsEventSchemaParts = schemaName.split('.')
        for (const part of awsEventSchemaParts) {
            builder.append(part)
        }
    }

    private buildCustomPackageName(builder: CodeGenPackageBuilder, schemaName: string) {
        builder.append(schemaName)
    }
}

class CodeGenPackageBuilder {
    private builder = ''
    private readonly formatter = new IdentifierFormatter()

    public getBuilder() {
        return this.builder
    }

    public append(segment: String): CodeGenPackageBuilder {
        if (this.builder.length > 0) {
            this.builder = this.builder.concat(this.formatter.PACKAGE_SEPARATOR)
        }
        this.builder = this.builder.concat(this.formatter.toValidIdentifier(segment.toLowerCase()))

        return this
    }
}

export class IdentifierFormatter {
    public readonly PACKAGE_SEPARATOR = '.'
    private readonly POTENTIAL_PACKAGE_SEPARATOR = '@'
    private readonly NOT_VALID_IDENTIFIER_CHARACTER = `[^a-zA-Z0-9_${this.POTENTIAL_PACKAGE_SEPARATOR}]`
    private readonly NOT_VALID_IDENTIFIER_REGEX = new RegExp(this.NOT_VALID_IDENTIFIER_CHARACTER, 'g')
    private readonly POTENTIAL_PACKAGE_SEPARATOR_REGEX = new RegExp(this.POTENTIAL_PACKAGE_SEPARATOR, 'g')
    private readonly UNDERSCORE = '_'

    public toValidIdentifier(name: string) {
        return name
            .replace(this.NOT_VALID_IDENTIFIER_REGEX, this.UNDERSCORE)
            .replace(this.POTENTIAL_PACKAGE_SEPARATOR_REGEX, this.PACKAGE_SEPARATOR)
    }
}
