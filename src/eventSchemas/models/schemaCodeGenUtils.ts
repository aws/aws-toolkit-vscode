/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

    public buildSchemaPackageName(schemaName: string): string {
        const builder = new CodeGenPackageBuilder()
        builder.append(this.SCHEMA_PACKAGE_PREFIX)
        this.buildPackageName(builder, schemaName)

        return builder.build()
    }

    private buildPackageName(builder: CodeGenPackageBuilder, schemaName: string): void {
        // do not modify the order of conditional checks
        if (this.isAwsPartnerEvent(schemaName)) {
            this.buildPartnerEventPackageName(builder, schemaName)
        } else if (this.isAwsEvent(schemaName)) {
            this.buildAwsEventPackageName(builder, schemaName)
        } else {
            this.buildCustomPackageName(builder, schemaName)
        }
    }

    private isAwsPartnerEvent(schemaName: string): boolean {
        return schemaName.startsWith(this.AWS_PARTNER_PREFIX)
    }

    private buildPartnerEventPackageName(builder: CodeGenPackageBuilder, schemaName: string): void {
        const partnerSchemaString = schemaName.substring(this.AWS_PARTNER_PREFIX.length)

        builder.append(this.AWS).append(this.PARTNER).append(partnerSchemaString)
    }

    private isAwsEvent(name: string): boolean {
        return name.startsWith(this.AWS_EVENTS_PREFIX)
    }

    private buildAwsEventPackageName(builder: CodeGenPackageBuilder, schemaName: string): void {
        const awsEventSchemaParts = schemaName.split('.')
        for (const part of awsEventSchemaParts) {
            builder.append(part)
        }
    }

    private buildCustomPackageName(builder: CodeGenPackageBuilder, schemaName: string): void {
        builder.append(schemaName)
    }
}

class CodeGenPackageBuilder {
    private builder = ''
    public build(): string {
        return this.builder
    }

    public append(segment: string): CodeGenPackageBuilder {
        if (this.builder.length > 0) {
            this.builder = this.builder.concat(IdentifierFormatter.PACKAGE_SEPARATOR)
        }
        this.builder = this.builder.concat(IdentifierFormatter.toValidIdentifier(segment.toLowerCase()))

        return this
    }
}

export namespace IdentifierFormatter {
    export const PACKAGE_SEPARATOR = '.'
    const POTENTIAL_PACKAGE_SEPARATOR = '@'
    const NOT_VALID_IDENTIFIER_REGEX = new RegExp(`[^a-zA-Z0-9_${POTENTIAL_PACKAGE_SEPARATOR}]`, 'g')
    const POTENTIAL_PACKAGE_SEPARATOR_REGEX = new RegExp(POTENTIAL_PACKAGE_SEPARATOR, 'g')
    const UNDERSCORE = '_'

    export function toValidIdentifier(name: string): string {
        return name
            .replace(NOT_VALID_IDENTIFIER_REGEX, UNDERSCORE)
            .replace(POTENTIAL_PACKAGE_SEPARATOR_REGEX, PACKAGE_SEPARATOR)
    }
}
