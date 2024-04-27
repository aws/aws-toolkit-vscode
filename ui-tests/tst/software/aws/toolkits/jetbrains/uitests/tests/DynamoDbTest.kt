// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.fixtures.ComboBoxFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.waitFor
import com.intellij.remoterobot.utils.waitForIgnoringError
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement
import software.amazon.awssdk.services.dynamodb.model.KeyType
import software.amazon.awssdk.services.dynamodb.model.LocalSecondaryIndex
import software.amazon.awssdk.services.dynamodb.model.ProjectionType
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.findByXpath
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import java.nio.file.Path
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.random.Random

@Disabled("Needs to be moved to accomodate plugin split")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DynamoDbTest {

    private val date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE)
    private val tableName = "uitest-$date-${UUID.randomUUID()}"
    private val dynamo = "DynamoDB"
    private val otherIndex = "OtherIndex"

    private lateinit var client: DynamoDbClient
    private lateinit var items: List<AllTypesType>

    @TempDir
    lateinit var tempDir: Path

    @BeforeAll
    fun setUp() {
        log.info("Creating table $tableName")
        client = DynamoDbClient.builder().region(Region.US_WEST_2).build()
        createAndPopulateTable()
        log.info("Table created")
    }

    @AfterAll
    fun cleanup() {
        log.info("Running final cleanup")
        client.deleteTable {
            it.tableName(tableName)
        }
        client.waiter().waitUntilTableNotExists { it.tableName(tableName) }
        log.info("Deleted table $tableName")
    }

    @Test
    @CoreTest
    fun testDynamoDbTableViewer() = uiTest {
        welcomeFrame {
            openFolder(tempDir)
        }

        idea {
            waitForBackgroundTasks()

            step("Open table") {
                awsExplorer {
                    expandExplorerNode(dynamo)
                    doubleClickExplorer(dynamo, tableName)
                }

                step("Check all data loaded") {
                    step("Wait for data to load") {
                        waitFor { findByXpath("//div[@class='JBTableHeader']").retrieveData().textDataList.map { it.text }.isNotEmpty() }
                    }
                    step("Check full table scan (default index)") {
                        val columnCount = step("Check columns") {
                            val cols = findByXpath("//div[@class='JBTableHeader']").retrieveData().textDataList.map { it.text }
                            // Can't do a straight-up string match because the column headers may be truncated for space
                            assertThat(cols).satisfiesExactlyInAnyOrder(
                                { assertThat(it).startsWith("Num") },
                                { assertThat(it).startsWith("Str") },
                                { assertThat(it).startsWith("Ter") },
                                { assertThat(it).startsWith("Boo") },
                                { assertThat(it).startsWith("Int") },
                                { assertThat(it).startsWith("Str") },
                                { assertThat(it).startsWith("Num") },
                                { assertThat(it).startsWith("Map") },
                                { assertThat(it).startsWith("Str") },
                                { assertThat(it).startsWith("Num") }
                            )
                            cols.size
                        }
                        step("Check data") {
                            val table = findByXpath("//div[@class='TableResults']").retrieveData().textDataList
                            val rowCount = table.size / columnCount
                            assertThat(rowCount).isEqualTo(items.size)
                        }
                    }
                    step("Select secondary local index $otherIndex") {
                        step("Expand scan panel") {
                            jLabel("Scan").click()
                        }
                        step("Select and run $otherIndex") {
                            find<ComboBoxFixture>(byXpath("//div[@class='ComboBox']")).selectItemContains(otherIndex)
                            button("Run").click()
                        }
                    }
                    step("Check only cols in $otherIndex") {
                        waitForIgnoringError {
                            assertThat(findByXpath("//div[@class='JBTableHeader']").retrieveData().textDataList.map { it.text }).hasSize(3)
                            true
                        }
                    }
                }
            }
        }
    }

    private fun createAndPopulateTable() {
        client.createTable { table ->
            table.tableName(tableName)
            table.attributeDefinitions(
                AttributeDefinition.builder().attributeName("NumericId").attributeType(ScalarAttributeType.N).build(),
                AttributeDefinition.builder().attributeName("StringSecondary").attributeType(ScalarAttributeType.S)
                    .build(),
                AttributeDefinition.builder().attributeName("TertiaryColumn").attributeType(ScalarAttributeType.S)
                    .build(),
            )
            table.keySchema(
                KeySchemaElement.builder().attributeName("NumericId").keyType(KeyType.HASH).build(),
                KeySchemaElement.builder().attributeName("StringSecondary").keyType(KeyType.RANGE).build()
            )
            table.localSecondaryIndexes(
                LocalSecondaryIndex.builder().indexName(otherIndex).keySchema(
                    KeySchemaElement.builder().attributeName("NumericId").keyType(KeyType.HASH).build(),
                    KeySchemaElement.builder().attributeName("TertiaryColumn").keyType(KeyType.RANGE).build()
                ).projection {
                    it.projectionType(ProjectionType.KEYS_ONLY)
                }.build()
            )
            table.provisionedThroughput {
                it.readCapacityUnits(10)
                it.writeCapacityUnits(5)
            }
        }

        client.waiter().waitUntilTableExists { it.tableName(tableName) }

        items = randomRange().map { AllTypesType() }

        items.forEach { item ->
            client.putItem {
                it.tableName(tableName)
                it.item(
                    mapOf(
                        "NumericId" to attr { n(item.id.toString()) },
                        "StringSecondary" to attr { s(item.secondary) },
                        "TertiaryColumn" to attr { s(item.tertiary) },
                        "Bool" to attr { bool(item.booleanProperty) },
                        "Int" to attr { n(item.intProperty.toString()) },
                        "StringMap" to attr { m(item.stringMapProperty.mapValues { v -> attr { s(v.value) } }) },
                        "NumberMap" to attr { m(item.numberMapProperty.mapValues { v -> attr { n(v.value.toString()) } }) },
                        "MapOfMap" to attr {
                            m(
                                item.mapOfMapProperty.mapValues { v ->
                                    attr {
                                        m(
                                            v.value.mapValues { sv ->
                                                attr {
                                                    s(sv.value)
                                                }
                                            }
                                        )
                                    }
                                }
                            )
                        },
                        "StringList" to attr { ss(item.stringList) },
                        "NumberList" to attr { ns(item.numberList.map { n -> n.toString() }) }
                    )
                )
            }
        }
    }

    private fun attr(block: AttributeValue.Builder.() -> Unit): AttributeValue = AttributeValue.builder().apply(block).build()

    private data class AllTypesType(
        val id: Long = Random.nextLong(0, Long.MAX_VALUE),
        val secondary: String = aString(),
        val tertiary: String = aString(),
        val booleanProperty: Boolean = Random.nextBoolean(),
        val intProperty: Int = Random.nextInt(),
        val stringMapProperty: Map<String, String> = randomRange().associate { aString() to aString() },
        val numberMapProperty: Map<String, Long> = randomRange().associate { aString() to Random.nextLong() },
        val mapOfMapProperty: Map<String, Map<String, String>> = randomRange().associate { aString() to randomRange().associate { aString() to aString() } },
        val stringList: List<String> = randomRange().map { aString() },
        val numberList: List<Long> = randomRange().map { Random.nextLong() }
    )
}

private fun randomRange() = 0..Random.nextInt(1, 10)
