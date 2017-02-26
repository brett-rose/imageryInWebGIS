define(["dojox/charting/themes/PlotKit/base", "dojox/charting/Theme"], function (pk, Theme) {
	pk.green12 = pk.base.clone();
	pk.green12.chart.fill = pk.green12.plotarea.fill = "#eff5e6";
	pk.green12.colors = Theme.defineColors({hue: 82, saturation: 60, low: 40, high: 88, num:12});
	
	return pk.green12;
});
