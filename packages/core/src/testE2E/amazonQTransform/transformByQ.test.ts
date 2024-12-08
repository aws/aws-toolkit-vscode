/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { setValidConnection } from '../util/connection'
import assert from 'assert'
import { JDKVersion, TransformationType, transformByQState } from '../../codewhisperer'
import {
    processLanguageUpgradeTransformFormInput,
    setMaven,
    startTransformByQ,
} from '../../codewhisperer/commands/startTransformByQ'
import { fs } from '../../shared'
import { TestFolder } from '../../test/testUtil'

describe('transformByQ', async function () {
    let tempDir = ''
    let tempFileName = ''
    let tempFilePath = ''
    let validConnection: boolean

    const javaFileContents = `public class MyApp {
            public static void main(String[] args) {
                Integer temp = new Integer("1234");
            }
        }`

    const pomXmlContents = `<?xml version="1.0" encoding="UTF-8"?>
        <project xmlns="http://maven.apache.org/POM/4.0.0"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
            <modelVersion>4.0.0</modelVersion>

            <groupId>com.example</groupId>
            <artifactId>basic-java-app</artifactId>
            <version>1.0-SNAPSHOT</version>

            <properties>
                <maven.compiler.source>1.8</maven.compiler.source>
                <maven.compiler.target>1.8</maven.compiler.target>
                <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
            </properties>

            <build>
                <plugins>
                    <plugin>
                        <groupId>org.apache.maven.plugins</groupId>
                        <artifactId>maven-compiler-plugin</artifactId>
                        <version>3.8.1</version>
                        <configuration>
                            <source>1.8</source>
                            <target>1.8</target>
                        </configuration>
                    </plugin>
                </plugins>
            </build>
        </project>`

    before(async function () {
        validConnection = await setValidConnection()
        if (!validConnection) {
            this.skip()
        }
        tempDir = path.join((await TestFolder.create()).path, 'qct-java-upgrade-test')
        tempFileName = 'MyApp.java'
        tempFilePath = path.join(tempDir, tempFileName)
        await fs.writeFile(tempFilePath, javaFileContents)
        tempFileName = 'pom.xml'
        tempFilePath = path.join(tempDir, tempFileName)
        await fs.writeFile(tempFilePath, pomXmlContents)
    })

    // TODO: this test 1) is skipped in GitHub CI due to no valid connection (see line 60 above) and
    // 2) even locally, fails due to the max test duration being set to 30s (this test takes ~5m)
    // Once both of the above are resolved, this test will pass
    // You can manually override the 30s limit (in setupUtil.ts) to confirm that the test passes locally
    it('WHEN transforming a Java 8 project E2E THEN job is successful', async function () {
        transformByQState.setTransformationType(TransformationType.LANGUAGE_UPGRADE)
        await setMaven()
        await processLanguageUpgradeTransformFormInput(tempDir, JDKVersion.JDK8, JDKVersion.JDK17)
        await startTransformByQ()
        assert.strictEqual(transformByQState.getPolledJobStatus(), 'COMPLETED')
    })
})
