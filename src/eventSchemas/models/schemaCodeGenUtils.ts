/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: This is fragile. Very fragile. But it is necessary to get Schemas service launched, and we've evaluated all other tradeoffs
// This will be done on the server-side as soon as we can, but for now the client needs to do this
export class SchemaCodeGenUtils {
    private readonly schemaPackagePrefix = 'schema'
    private readonly AWS = 'aws'
    private readonly PARTNER = 'partner'
    private readonly awsPartnerPrefix = `${this.AWS}.${this.PARTNER}-` // dash suffix because of 3p partner registry name format
    private readonly awsEventsPrefix = `${this.AWS}.` // . suffix because of 1p event registry schema format

    public buildSchemaPackageName(schemaName: string): string {
        const builder = new CodeGenPackageBuilder()
        builder.append(this.schemaPackagePrefix)
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
        return schemaName.startsWith(this.awsPartnerPrefix)
    }

    private buildPartnerEventPackageName(builder: CodeGenPackageBuilder, schemaName: string): void {
        const partnerSchemaString = schemaName.substring(this.awsPartnerPrefix.length)

        builder.append(this.AWS).append(this.PARTNER).append(partnerSchemaString)
    }

    private isAwsEvent(name: string): boolean {
        return name.startsWith(this.awsEventsPrefix)
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
            this.builder = this.builder.concat(packageSeparator)
        }
        this.builder = this.builder.concat(toValidIdentifier(segment.toLowerCase()))

        return this
    }
}

export const packageSeparator = '.'
const potentialPackageSeparator = '@'
const notValidIdentifierRegex = new RegExp(`[^a-zA-Z0-9_${potentialPackageSeparator}]`, 'g')
const potentialPackageSeparatorRegex = new RegExp(potentialPackageSeparator, 'g')
const underscore = '_'

export function toValidIdentifier(name: string): string {
    return name.replace(notValidIdentifierRegex, underscore).replace(potentialPackageSeparatorRegex, packageSeparator)
}
