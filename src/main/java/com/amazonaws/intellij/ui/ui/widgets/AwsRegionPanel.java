package com.amazonaws.intellij.ui.ui.widgets;

import com.amazonaws.intellij.core.region.AwsRegion;
import com.amazonaws.intellij.core.region.AwsRegionManager;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionListener;

/**
 * Created by zhaoxiz on 7/28/17.
 */
public class AwsRegionPanel {
    private JPanel regionPanel;
    private com.intellij.openapi.ui.ComboBox<AwsRegion> regionCombo;

    public AwsRegionPanel(String defaultRegion) {

        regionCombo.setRenderer(new DefaultListCellRenderer() {
            @Override
            public Component getListCellRendererComponent(JList list, Object value, int index, boolean isSelected, boolean cellHasFocus) {
                JLabel label = (JLabel) super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus);
                label.setIcon(((AwsRegion) value).getIcon());
                return label;
            }
        });

        for (AwsRegion region : AwsRegionManager.INSTANCE.getRegions()) {
            regionCombo.addItem(region);
        }
        selectRegion(defaultRegion);
    }

    public void addActionListener(ActionListener actionListener) {
        regionCombo.addActionListener(actionListener);
    }

    public JPanel getRegionPanel() {
        return regionPanel;
    }

    private void selectRegion(String regionId) {
        for (AwsRegion region : AwsRegionManager.INSTANCE.getRegions()) {
            if (region.getId().equals(regionId)) {
                regionCombo.setSelectedItem(region);
                break;
            }
        }
    }

    public String getSelectedRegion() {
        return ((AwsRegion) regionCombo.getSelectedItem()).getId();
    }

}
