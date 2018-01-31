package software.aws.toolkits.jetbrains.ui.s3;

import static com.intellij.ui.IdeBorderFactory.TITLED_BORDER_LEFT_INSET;
import static com.intellij.ui.IdeBorderFactory.TITLED_BORDER_RIGHT_INSET;
import static com.intellij.ui.IdeBorderFactory.TITLED_BORDER_TOP_INSET;

import software.aws.toolkits.jetbrains.aws.s3.S3BucketVirtualFile;
import software.aws.toolkits.jetbrains.ui.KeyValue;
import software.aws.toolkits.jetbrains.ui.KeyValueTableEditor;
import software.aws.toolkits.jetbrains.ui.MessageUtils;
import com.amazonaws.intellij.utils.DateUtils;
import com.amazonaws.services.s3.AmazonS3;
import com.amazonaws.services.s3.model.BucketTaggingConfiguration;
import com.amazonaws.services.s3.model.Region;
import com.amazonaws.services.s3.model.TagSet;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.openapi.util.Pair;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.components.JBLabel;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.TextTransferable;
import java.awt.Insets;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JPanel;

public class BucketDetailsPanel {
    private static final int BUCKET_TAG_LIMIT = 50;
    private static final int MAX_KEY_LENGTH = 128;
    private static final int MAX_VALUE_LENGTH = 256;
    private static final Pattern KEY_VALUE_VALID_REGEX = Pattern.compile("^([\\p{L}\\p{Z}\\p{N}_.:/=+\\-]*)$");
    private static final String KEY_VALUE_VALIDATION_ERROR =
        "The string can contain only the set of Unicode letters, digits, whitespace, '_', '.', '/', '=', '+', '-'";

    private final S3BucketVirtualFile bucketVirtualFile;
    private JPanel contentPanel;
    private JPanel tagPanel;
    private JBLabel bucketNameLabel;
    private JBLabel region;
    private JBLabel versioning;
    private JBLabel creationDate;
    private JButton copyArnButton;
    private KeyValueTableEditor tags;
    private JButton applyButton;
    private JButton cancelButton;

    public BucketDetailsPanel(Project project, S3BucketVirtualFile bucketVirtualFile) {
        this.bucketVirtualFile = bucketVirtualFile;

        this.contentPanel.setBorder(IdeBorderFactory.createTitledBorder("Bucket Details", false));

        this.bucketNameLabel.setText(bucketVirtualFile.getName());

        this.region.setText(determineRegion());
        this.versioning.setText(bucketVirtualFile.getVersioningStatus());
        this.creationDate.setText(DateUtils.formatDate(bucketVirtualFile.getTimeStamp()));

        Insets insets = JBUI.insets(TITLED_BORDER_TOP_INSET, TITLED_BORDER_LEFT_INSET, 0, TITLED_BORDER_RIGHT_INSET);
        this.tagPanel.setBorder(IdeBorderFactory.createTitledBorder("Tags", false, insets));

        this.copyArnButton.addActionListener(e -> {
            String arn = "arn:aws:s3:::" + bucketVirtualFile.getName();
            CopyPasteManager.getInstance().setContents(new TextTransferable(arn));
        });

        this.applyButton.addActionListener(actionEvent -> applyChanges());
        this.cancelButton.addActionListener(actionEvent -> cancelChanges());

        this.tags.refresh();
    }


    private void createUIComponents() {
        tags = new KeyValueTableEditor(this::loadTags, BUCKET_TAG_LIMIT, this::validateTag, this::updateButtons);
    }

    private List<KeyValue> loadTags() {
        AmazonS3 s3Client = bucketVirtualFile.getFileSystem().getS3Client();
        BucketTaggingConfiguration bucketTags = s3Client.getBucketTaggingConfiguration(
            bucketVirtualFile.getName());
        if (bucketTags == null) {
            return Collections.emptyList();
        }

        return bucketTags.getTagSet()
                         .getAllTags()
                         .entrySet()
                         .stream()
                         .map(entry -> new KeyValue(entry.getKey(), entry.getValue()))
                         .collect(Collectors.toList());
    }

    private ValidationInfo validateTag(Pair<String, JComponent> keyPair, Pair<String, JComponent> valuePair) {
        String key = keyPair.getFirst();
        JComponent keyInput = keyPair.getSecond();
        if (key.length() < 1 || key.length() >= MAX_KEY_LENGTH) {
            return new ValidationInfo("Key must be between 1 and " + MAX_KEY_LENGTH + " characters", keyInput);
        }

        if (!KEY_VALUE_VALID_REGEX.matcher(key).matches()) {
            return new ValidationInfo(KEY_VALUE_VALIDATION_ERROR, keyInput);
        }

        String value = valuePair.getFirst();
        JComponent valueInput = valuePair.getSecond();
        if (value.length() >= MAX_VALUE_LENGTH) {
            return new ValidationInfo("Key must be between 1 and " + MAX_VALUE_LENGTH + " characters", valueInput);
        }

        if (!KEY_VALUE_VALID_REGEX.matcher(value).matches()) {
            return new ValidationInfo(KEY_VALUE_VALIDATION_ERROR, valueInput);
        }

        return null;
    }

    private void updateButtons() {
        if (tags.isModified() && !tags.isBusy()) {
            applyButton.setEnabled(true);
            cancelButton.setEnabled(true);
        } else {
            applyButton.setEnabled(false);
            cancelButton.setEnabled(false);
        }
    }

    private void applyChanges() {
        tags.setBusy(true);
        updateButtons();
        ApplicationManager.getApplication().executeOnPooledThread(this::updateTags);
    }

    private void updateTags() {
        List<KeyValue> newTags = tags.getItems();
        Map<String, String> tagMap = newTags.stream().collect(Collectors.toMap(KeyValue::getKey, KeyValue::getValue));
        BucketTaggingConfiguration config = new BucketTaggingConfiguration(Collections.singleton(new TagSet(tagMap)));
        bucketVirtualFile.getFileSystem().getS3Client().setBucketTaggingConfiguration(bucketVirtualFile.getName(), config);
        tags.setBusy(false);
    }

    private void cancelChanges() {
        if (!MessageUtils.verifyLossOfChanges(contentPanel)) {
            return;
        }

        tags.reset();
        updateButtons();
    }

    private String determineRegion() {
        Region region = bucketVirtualFile.getRegion();
        if (region != null) {
            if (region == Region.US_Standard) {
                return "us-east-1";
            }
            return region.getFirstRegionId();
        } else {
            return "Unknown";
        }
    }

    public JComponent getComponent() {
        return contentPanel;
    }
}
