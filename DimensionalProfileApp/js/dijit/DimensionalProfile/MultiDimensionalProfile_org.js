define([
  "esri/dijit/_EventedWidget",
  "dojo/on",
  "dojo/mouse",
  "dojo/aspect",
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/_base/Deferred",
  "dojo/number",

  "dijit/registry",
  "dijit/_WidgetBase",
  "dijit/_OnDijitClickMixin",
  "dijit/_TemplatedMixin",
  "dijit/_WidgetsInTemplateMixin",

  "dojo/dom-geometry",
  "dojo/_base/Color",

  "dojox/charting/Chart",
  "dojox/charting/axis2d/Default",
  "dojox/charting/plot2d/Grid",
  "dojox/charting/plot2d/Markers",
  "dojox/charting/plot2d/Areas",
  "dojox/charting/action2d/MouseIndicator",
  "dojox/charting/action2d/TouchIndicator",
  "dojox/charting/themes/ThreeD",
  "dojox/charting/SimpleTheme",
  "dojox/charting/widget/SelectableLegend",

  "esri/config",
  "esri/sniff",
  "esri/request",
  "esri/graphic",

  "esri/layers/ArcGISImageServiceLayer",
  "esri/layers/ImageServiceParameters",
  "esri/layers/GraphicsLayer",
  "esri/layers/DimensionalDefinition",
  "esri/layers/RasterFunction",

  "dojo/i18n!../../nls/jsapi",
  "dojo/text!./templates/DimensionalProfile.html",
  "xstyle/css!./css/MultiDimensionalProfile.css"

], function (_EventedWidget, on, mouse, aspect, declare, lang, array, Deferred, number,
            registry, WidgetBase, _OnDijitClickMixin, _TemplatedMixin, _WidgetsInTemplateMixin,
            domGeometry, Color,
            Chart, Default, Grid, Markers, Areas, MouseIndicator, TouchIndicator, ThreeD, SimpleTheme, SelectableLegend,
            esriConfig, esriSniff, esriRequest, Graphic,
            ArcGISImageServiceLayer, ImageServiceParameters, GraphicsLayer, DimensionalDefinition, RasterFunction,
            jsapiBundle, dimensionalProfileTemplate) {

  return declare([WidgetBase, _OnDijitClickMixin, _TemplatedMixin, _WidgetsInTemplateMixin], {
    declaredClass: "esri.dijit.MultiDimensionalProfile",
    baseClass: "esriMultiDimensionalChart",
    templateString: dimensionalProfileTemplate,

    SERIES_NAME_DIMENSIONS: "Dimensions",
    SERIES_NAME_LEGEND: "Point",

    //Sampling point count
    _samplingDataCount: 50,
    _reduceDataPoints: true,

    //Chart rendering options
    _chartRenderingOptions: null,

    // DEFAULT PROFILE DATA RANGE 
    _defaultXAxisRange: {
      min: Number.MAX_VALUE,
      max: Number.MIN_VALUE
    },
    _defaultYAxisRange: {
      min: 0.0,
      max: 100.0
    },
    _xAxisRange: null,
    _yAxisRange: null,

    /**
     * An array of {
     *  geometry
     *  values
     *  }
     */
    _profileResults: [],
    _maxResultCount: 4,

    _map: null,
    _layers: [],
    //_layerProperties: [],
    _dimension: null,
    _variable: null,
    _chart: null,
    _valueIndicator: [],
    _drawProfileGeometry: true,
    _mapGraphics: [],

    _chartLocationGraphic: null,
    _posIndicator: null,
    _negIndicator: null,
    _chartLocationGraphicsLayer: null,
    _defaultMapSymbol: {
      type: "esriSMS",
      style: "esriSMSCross",  //  esriSMSSquare
      color: [0, 0, 0, 0],
      size: 13,
      angle: 0,
      xoffset: 0,
      yoffset: 0,
      outline: {
        type: "esriSLS",
        style: "esriSLSSolid",
        color: [0, 0, 0, 255],
        width: 3
      }
    },

    _profileSeries: [
      { stroke: "#ff00a9", fill: "" }, //pink
      { stroke: "#00ff00", fill: "" }, //green
      { stroke: "#ff5722", fill: "" }, //orange
      { stroke: "#0900ff", fill: "" }, //blue
      { stroke: "#845422", fill: "" }, //brown
      { stroke: "#6C618D", fill: "" }  //purple
    ],

    /**
     * CTOR
     * @param options
     * @param srcRefNode
     */
    constructor: function (options, srcRefNode) {
      //declare.safeMixin(this, options);
      this._layers = [];
      //this._layerProperties = [];
      this._i18n = jsapiBundle;

      //Get the map
      if (options.hasOwnProperty("map")) {
        this._map = options.map;
      }

      //Get the layers
      if (options.hasOwnProperty("layers")) {
        options.layers.forEach(function (layerObj) {
          var options = this._updateLayerOptions(layerObj);
          layerObj.options = options;
          this._layers.push(layerObj);
        }.bind(this));
      }

      // For multi-layer we allow only one spatial query
      if (this._layers.length > 1) {
        this._maxResultCount = this._layers.length;
      }
     
      //Get the active dimension to be displayed on the Y axis
      if (options.hasOwnProperty("dimension")) {
        this._dimension = options.dimension;
      }
      //Get the active variable to be displayed on the X axis
      if (options.hasOwnProperty("variable")) {
        this._variable = options.variable;
      }
      //Get the active variable to be displayed on the X axis
      if (options.hasOwnProperty("drawGraphicOnMap")) {
        this._drawGraphicOnMap = options.drawGraphicOnMap;
      }

      // CHART RENDERING OPTIONS //
      this._chartRenderingOptions = lang.mixin({
        xAxisTitle: "X",
        yAxisTitle: "Y",
        chartFontFamily: "verdana",
        chartTitleFontSize: 13,
        axisTitleFontSize: 11,
        axisLabelFontSize: 9,
        indicatorFontColor: "#eee",
        indicatorFillColor: "#666",
        titleFontColor: "#eee",
        axisFontColor: "#ccc",
        axisMajorTickColor: "#333",
        profileBackgroundTopColor: [250, 250, 250, 0.8],  //"#f8f8fa", //"#B0E0E6",
        profileBackgroundBottomColor: [229, 230, 235, 0.7],  //"#e5e6eb",  //"#4682B4",
        profileLineColor: "#D2B48C",
        profileTopColor: "#8B4513",
        profileBottomColor: "#CD853F",
        indicatorMarkerStrokeColor: "#FF0000",
        indicatorMarkerSymbol: "m -6 -6, l 12 12, m 0 -12, l -12 12",  // Red X
        profileGeometrySymbol: this._defaultMapSymbol
      }, options.chartOptions || {});
    },

    /**
     *  Wire UI events
     */
    postCreate: function () {
      this.inherited(arguments);
      // RESIZE AFTER PARENT RESIZE //
      if (registry.getEnclosingWidget(this.domNode) !== null) {
        this.own(aspect.after(registry.getEnclosingWidget(this.domNode), "resize", lang.hitch(this, this.resize), true));
      }
    },

    /**
     * Start the dijit
     */
    startup: function () {
      this.inherited(arguments);
      if (!this._map || !this._layers.length || !this._dimension) {
        this.emit("error", new Error(this._i18n.widgets.DimensionalProfile.errors.MissingInputParameters));
        this.destroy();
      }
      else {
        if (this.map.loaded) {
          this._initProfile();
        }
        else {
          this.map.on("load", this._initProfile.bind(this));
        }
      }
    },

    /**
     * Clears the profile chart
     */
    clear: function () {
      this._displayChartLocation(-1);
      this._clearProfileGeometriesOnMap();
      this._resetProfileResults();
      this._clearIndicators();
      this._clearChart();
      this.emit("clear");
    },

    /**
     * Refreshes the profile chart with new values
     */
    refresh: function () {
      //this.update(this._sourceProfileResults || this._profileResults);
      this.emit("refresh");
    },

    /**
     * Updates the profile chart with new values
     * @param profileResults
     */
    update: function (profileResult) {
      if (!profileResult) {
        this.emit(new Error(this._i18n.widgets.DimensionalProfile.errors.InvalidProfileResults));
        return;
      }

      var mProfileResult = this._reduceProfileResults(lang.mixin({}, profileResult));
      this._updateProfileResults(mProfileResult);
      this._updateChart(mProfileResult);
      this._updateGraphic(mProfileResult);
      this._updateIndicators();
      this.emit("update", mProfileResult);
    },

    /**
     * Resize profile chart
     * @private
     */
    resize: function () {
      this.inherited(arguments);
      if (this._chart) {
        this._chart.resize();
      }
    },

    /**
     * Destroy
     */
    destroy: function () {
      if (this._chart) {
        this._chart.destroy();
      }
      this.inherited(arguments);
    },

    //_applyLayerProperties: function(layerObj) {
    //  if (!layerObj || !layerObj.layer) {
    //    return null;
    //  }

    //  var orgLayer = layerObj.layer;
    //  var isParameters = {};
    //  isParameters.imageServiceParameters = new ImageServiceParameters();

    //  // Apply the renderingRule if its defined
    //  var renderingRule = layerObj.options.renderingRule;
    //  if (renderingRule) {
    //    var rFunction = new RasterFunction(renderingRule);
    //    rFunction.functionName = renderingRule;
    //    isParameters.imageServiceParameters.renderingRule = rFunction;
    //  } else if (orgLayer.renderingRule) {
    //    isParameters.imageServiceParameters.renderingRule = orgLayer.renderingRule;
    //  }

    //  var mosaicRule = orgLayer.mosaicRule || orgLayer.defaultMosaicRule;
    //  if (layerObj.options.variable && mosaicRule) {
    //    mosaicRule.multidimensionalDefinition.push(new DimensionalDefinition({
    //      variableName: layerObj.variable
    //    }));
    //    isParameters.imageServiceParameters.mosaicRule = mosaicRule;
    //  } else if (orgLayer.mosaicRule) {
    //    isParameters.imageServiceParameters.mosaicRule = orgLayer.mosaicRule;
    //  }

    //  var layer = new ArcGISImageServiceLayer(layerObj.layer.url, isParameters);  //lang.clone(
    //  layer.setUseMapTime(layerObj.options.useMapTime ? true : false);

    //  return layer;
    //},

    //_getLayerProperties: function (layer) {
    //  return layer && this._layerProperties[layer.chartId];
    //},

    _updateLayerOptions: function (layerObj) {
      if (!layerObj || !layerObj.options) {
        return {};
      }

      var options = lang.mixin({}, layerObj.options);

      // Update the renderingRule if its defined
      var renderingRule = layerObj.options.renderingRule;
      if (renderingRule) {
        var rFunction = new RasterFunction(renderingRule);
        rFunction.functionName = renderingRule;
        options.renderingRule = rFunction;
      }

      return options;
    },

    /**
     * Update the dimensional profile geometry
     * @param geometry
     */
    _setProfileGeometryAttr: function (geometry) {
      if (geometry) {
        this._map.setMapCursor("progress");

        this._layers.forEach(lang.hitch(this, function (layerObj) {
          var graphic = this._createNewMapGraphic(geometry);
          this._drawProfileGeometryOnMap(graphic);
          this._getProfile(layerObj, graphic).then(lang.hitch(this, function (profileResult) {
            this._map.setMapCursor("default");
            this.update(profileResult);
          }), lang.hitch(this, function (error) {
            this._map.setMapCursor("default");
            this.emit("error", error);
          }));
        }));
      }
      else {
        this.emit("error", new Error(this._i18n.widgets.DimensionalProfile.errors.NullGeometry));
      }
    },

    /**
     * Set the title of the profile chart
     * @param title
     * @private
     */
    _setTitleAttr: function (title) {
      if (!this._chart) {
        return;
      }
      this._chart.title = title;
      this._chart.dirty = true;
      this._chart.render();
      this.emit("title-changed");
    },

    /**
     * Resets the profile chart with default values
     * @private
     */
    _resetProfileResults: function () {
      this._xAxisRange = lang.mixin({}, this._defaultXAxisRange);
      this._yAxisRange = lang.mixin({}, this._defaultYAxisRange);
      this._profileResults = [];
    },

    /**
     * Init the UI
     * @private
     */
    _initProfile: function () {
      this._buildProfileSeries();
      this._getDefaultDimensionalRange().then(function (result) {
        this._defaultXAxisRange = result;
        this._resetProfileResults();
        this._buildChart();
        this.emit("load");
      }.bind(this));
    },

    _buildProfileSeries: function () {
      var sIdx = 0,
          cIdx = -1,
          orgProfileSeries = JSON.parse(JSON.stringify(this._profileSeries)),
          useComparisonSeries = (this._layers.length === 2);

      //var maxSeries = this._maxResultCount / this._layers.length;
      //this._layers.forEach(function (layer) {
      //  var layerProperties = this._getLayerProperties(layer);
      //  layerProperties.profileSeries = [];
      //  var layerLegend = layerProperties && layerProperties.legendLabel;
      //  for (sIdx; sIdx < maxSeries; sIdx++) {
      //    if (sIdx >= this._profileSeries.length) {
      //      var rColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
      //      this._profileSeries.push({ stroke: rColor, fill: "" }); // add new ones...
      //    }

      //    var profileSeries = this._profileSeries[sIdx];
      //    // set name
      //    profileSeries.name = this.SERIES_NAME_DIMENSIONS + "_" + sIdx;
      //    profileSeries.legend = (layerLegend || this.SERIES_NAME_LEGEND) + " " + sIdx;
      //    layerProperties.profileSeries.push(profileSeries);
      //  }
      //}.bind(this));


      var layerProperties = this._layers[0].options,
          layerLegend, layerLegend0, layerLegend1,
          seriesColor, seriesColor0, seriesColor1;
      layerLegend = layerLegend0 = layerProperties && layerProperties.legendLabel;
      seriesColor = seriesColor0 = layerProperties && layerProperties.seriesColor;
      if (useComparisonSeries) {
        var layerProperties1 = this._layers[1].options;
        layerLegend1 = layerProperties1 && layerProperties1.legendLabel;
        seriesColor1 = layerProperties1 && layerProperties1.seriesColor;
      }
      for (sIdx; sIdx < this._maxResultCount; sIdx++) {
        // set color
        if (sIdx < this._profileSeries.length && useComparisonSeries) {
          layerLegend = Math.abs(sIdx % 2) === 0 ? layerLegend0 : layerLegend1; // Increase for even numbers
          seriesColor = Math.abs(sIdx % 2) === 0 ? seriesColor0  : seriesColor1; // Increase for even numbers
        } else if (sIdx < this._profileSeries.length && !useComparisonSeries && layerLegend0) {
          layerLegend = layerLegend0 + " " + sIdx; 
        } else if (sIdx >= this._profileSeries.length) {
          var rColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
          this._profileSeries.push({ stroke: rColor, fill: "" }); // add new ones...
        }

        // set name
        if (seriesColor) {
          this._profileSeries[sIdx].stroke = seriesColor;
        }
        this._profileSeries[sIdx].name = this.SERIES_NAME_DIMENSIONS + "_" + sIdx;
        this._profileSeries[sIdx].legend = layerLegend || (this.SERIES_NAME_LEGEND + " " + sIdx);
      }
    },

    /**
     * Create and initializes the profile chart with default values
     * @private
     */
    _buildChart: function () {
      var newChart = new Chart(this._chartNode, {
        title: this._chartRenderingOptions.title, //i18NStrings.chart.title, || "Dimensional Profile"
        titlePos: "top",
        titleGap: 10,
        titleFont: lang.replace("normal normal bold {chartTitleFontSize}pt {chartFontFamily}", this._chartRenderingOptions),
        titleFontColor: this._chartRenderingOptions.titleFontColor
      });

      //Set theme
      if (this._layers.length === 2) {
        var myTheme = new SimpleTheme({
          markers: {
            CIRCLE: "m-3,0 c0,-4 6,-4 6,0 m-6,0 c0,4 6,4 6,0",
            SQUARE: "m-3,-3 l0,6 6,0 0,-6 z"
          }
        });
        newChart.setTheme(myTheme);
      } else {
        newChart.setTheme(ThreeD);
      }

      //Override defaults
      newChart.fill = "transparent";
      newChart.theme.axis.stroke.width = 2;
      newChart.theme.axis.majorTick.color = Color.named.white.concat(0.5);
      newChart.theme.axis.majorTick.width = 1.0;
      newChart.theme.plotarea.fill = {
        type: "linear",
        space: "plot",
        x1: 50, y1: 100, x2: 50, y2: 0,
        colors: [
          { offset: 0.0, color: this._chartRenderingOptions.profileBackgroundTopColor },
          { offset: 1.0, color: this._chartRenderingOptions.profileBackgroundBottomColor }
        ]
      };


      //if (this._layers.length == 2) {
      //  var curMarkers = newChart.theme.markers;
      //  var subsetMarkers = [];
      //  subsetMarkers.push(curMarkers[0]);
      //  subsetMarkers.push(curMarkers[1]);
      //  newChart.theme.setMarkers(subsetMarkers);
      //}

      //Y-axis
      newChart.addAxis("y", {
        min: this._yAxisRange.min,
        max: this._yAxisRange.max,
        fontColor: this._chartRenderingOptions.axisFontColor,
        font: lang.replace("normal normal bold {axisLabelFontSize}pt {chartFontFamily}", this._chartRenderingOptions),
        vertical: true,
        natural: true,
        fixed: true,
        includeZero: false,
        majorLabels: true,
        minorLabels: true,
        majorTicks: true,
        minorTicks: true,
        majorTick: { color: this._chartRenderingOptions.axisMajorTickColor, length: 6 },
        title: this._chartRenderingOptions.yAxisTitle,
        titleGap: 30,
        titleFont: lang.replace("normal normal bold {axisTitleFontSize}pt {chartFontFamily}", this._chartRenderingOptions),
        titleFontColor: this._chartRenderingOptions.titleFontColor,
        titleOrientation: "axis"
      });

      //X-axis
      newChart.addAxis("x", {
        min: this._xAxisRange.min,
        max: this._xAxisRange.max,
        fontColor: this._chartRenderingOptions.axisFontColor,
        font: lang.replace("normal normal bold {axisLabelFontSize}pt {chartFontFamily}", this._chartRenderingOptions),
        natural: true,
        fixed: true,
        includeZero: false,
        majorLabels: true,
        minorLabels: true,
        majorTicks: true,
        minorTicks: true,
        majorTick: { color: this._chartRenderingOptions.axisMajorTickColor, length: 6 },
        title: this._chartRenderingOptions.xAxisTitle,  //lang.replace(i18NStrings.chart.distanceTitleTemplate, [this._unitConversion.getFullLabel(this._distanceUnits)]),
        titleGap: 5,
        titleFont: lang.replace("normal normal bold {axisTitleFontSize}pt {chartFontFamily}", this._chartRenderingOptions),
        titleFontColor: this._chartRenderingOptions.titleFontColor,
        titleOrientation: "away",
        labelFunc: lang.hitch(this, this._formatChartValues)
      });

      //Grid
      newChart.addPlot("grid", {
        type: Grid,
        hMajorLines: true,
        hMinorLines: false,
        vMajorLines: false,
        vMinorLines: false
      });

      //Profile plot
      newChart.addPlot("default", { type: Markers, tension: "X" });  // tension: S, X, "", shadow: { dx: 2, dy: 2 } }, animate: { duration: 200 }

      //Profile data
      var seriesOptions = {
        plot: "default",
        stroke: { width: 1.5, color: this._chartRenderingOptions.profileLineColor },
        fill: this._chartRenderingOptions.profileTopColor
      };

      var sIdx = 0;
      for (sIdx; sIdx < this._maxResultCount; sIdx++) {
        var mSeriesOptions = lang.clone(seriesOptions);
        mSeriesOptions.stroke.color = this._profileSeries[sIdx].stroke;
        mSeriesOptions.fill = this._profileSeries[sIdx].stroke;
        mSeriesOptions.legend = this._profileSeries[sIdx].legend;
        newChart.addSeries(this._profileSeries[sIdx].name, [], mSeriesOptions);
      }

      //Render chart
      newChart.render();
      var chartLegend = new SelectableLegend({ chart: newChart, autoScale: true }, this._chartLegendNode);
      //, outline: true, autoScale: true

      this._chart = newChart;
      this._chartLegend = chartLegend;
    },

    _formatChartValues: function (text, value) {
      if (this._dimension && this._dimension.toLowerCase() === "stdtime") {
        return new Date(value).toUTCString().substring(5, 16);
      }
      return value;
    },

    _chartTooltipForX: function (value, options) {
      var dimString = value.x;
      if (this._dimension && this._dimension.toLowerCase() === "stdtime") {
        dimString = new Date(value.x).toUTCString().substring(5, 16);
      }
      return this._chartRenderingOptions.xAxisTitle + ": " + dimString;
    },

    _chartTooltipForY: function (value) {
      var valY = (value.y && typeof value.y === "string") ? parseFloat(value.y) : value.y;
      return this.label + ": " + valY.toFixed(3);
    },

    /**
     * Get profile from selected or digitized polyline
     * @param polyline
     * @returns {*}
     * @private
     */
    _getProfile: function (layerObj, graphic) {
      var layer = layerObj.layer;
      var geometry = graphic && graphic.geometry;
      var geometryType = "esriGeometryPoint";  // To do use geometry.type

      if (!layer || !graphic || !geometry) {
        return new Error(this.strings.errors.UnableToProcessResults);
      }

      var identifyRequest = {
        f: "json",
        //time: JSON.stringify([map.timeExtent.startTime.valueOf(), map.timeExtent.endTime.valueOf()]),
        geometry: JSON.stringify(geometry.toJson()),
        geometryType: geometryType,
        returnGeometry: false,
        returnCatalogItems: true
      };

      var layerProperties = layerObj.options;

      var mosaicRule = layer.mosaicRule || layer.defaultMosaicRule;
      if (layerProperties.variable && mosaicRule) {
        var mRule = lang.clone(mosaicRule);
        mRule.multidimensionalDefinition.push(new DimensionalDefinition({
          variableName: layerProperties.variable
        }));
        identifyRequest.mosaicRule = JSON.stringify(mRule.toJson());
      }

      var tagsToSearch = ["value"];
      var renderingRule = (layerProperties && layerProperties.renderingRule) || layer.renderingRule;
      if (renderingRule) {
        tagsToSearch.push(renderingRule.functionName.toLowerCase());  //Need to be removed later
        identifyRequest.renderingRule = JSON.stringify(renderingRule.toJson());
      }

      var useMapTime = (layerProperties && layerProperties.hasOwnProperty("useMapTime")) ? layerProperties.useMapTime : layer.useMapTime;
      if (useMapTime && this._map.timeExtent) {
        identifyRequest.time = this._map.timeExtent.toJson().join(",");
      }

      // Execute Identify request
      return esriRequest({
        url: layer.url + "/identify",
        handleAs: "json",
        content: identifyRequest
      }).then(lang.hitch(this, function (results) {
        //Check for results
        if (!results || results.catalogItems.length < 1) {
          return;
        }

        var profileFeatures = results.catalogItems.features;
        var dimensionValues = [];
        var layerVariable = this._getLayerVariable(layer);

        // GET FEATURE //
        array.forEach(profileFeatures, function (feature, idx) {
          var pixelValue = results.properties.Values[idx];
          var attr = feature.attributes;
          // Removed additional tag search tagsToSearch.indexOf(attr.Tag.toLowerCase()) > -1
          if (pixelValue && pixelValue.toLowerCase() !== "nodata" &&
              (!layerVariable || attr.Variable.toLowerCase() === layerVariable.toLowerCase())) {
            var dimValue = {
              x: attr[this.dimension],
              y: pixelValue
            };
            dimensionValues.push(dimValue);
          }
        }.bind(this));

        //Resolve task
        return {
          values: dimensionValues,
          graphic: graphic
        };
      }), lang.hitch(this, function () {
        return new Error(this.strings.errors.UnableToProcessResults);
      }));
    },

    /**
     * Update the chart with new values
     * @param profileResults
     * @private
     */
    _updateProfileResults: function (profileResult) {
      if (!profileResult) {
        return;
      }

      if (this._profileResults.length === this._profileSeries.length) {
        // pop the oldest result
        profileResult.series = this._profileResults[0].series;
        this._profileResults.shift();
      } else {
        profileResult.series = this._profileSeries[this._profileResults.length];
      }

      // sort the x values 
      profileResult.values.sort(function (val1, val2) {
        return (val1.x - val2.x);
      });

      this._profileResults.push(profileResult);

      var defAxisRange = {
        min: Number.MAX_VALUE,
        max: Number.MIN_VALUE
      };
      var xAxisRange, yAxisRange;
      xAxisRange = lang.mixin({}, defAxisRange);  //this._defaultXAxisRange
      yAxisRange = lang.mixin({}, defAxisRange);
      array.forEach(this._profileResults, function (result) {
        var minX = this._getArrayMin(result.values, "x");
        var maxX = this._getArrayMax(result.values, "x");
        var minY = this._getArrayMin(result.values, "y");
        var maxY = this._getArrayMax(result.values, "y");
        xAxisRange.min = minX < xAxisRange.min ? minX : xAxisRange.min;
        xAxisRange.max = maxX > xAxisRange.max ? maxX : xAxisRange.max;
        yAxisRange.min = minY < yAxisRange.min ? minY : yAxisRange.min;
        yAxisRange.max = maxY > yAxisRange.max ? maxY : yAxisRange.max;
      }.bind(this));

      this._xAxisRange = xAxisRange;
      this._yAxisRange = yAxisRange;
      this._yAxisRange.min = yAxisRange.min - (0.03 * yAxisRange.min); //Number.MIN_VALUE;
      this._yAxisRange.max = yAxisRange.max + (0.03 * yAxisRange.max); //Number.MIN_VALUE;
    },

    /**
     * Updates the chart with new values
     * @private
     */
    _updateChart: function (profileResult) {

      if (!this._chart) {
        return;
      }

      //Update chart
      this._chart.getAxis("x").opt.min = this._xAxisRange.min;
      this._chart.getAxis("x").opt.max = this._xAxisRange.max;
      this._chart.getAxis("y").opt.min = this._yAxisRange.min;
      this._chart.getAxis("y").opt.max = this._yAxisRange.max;

      this._chart.dirty = true;

      if (profileResult) {
        var seriesName = profileResult.series.name;
        this._chart.updateSeries(seriesName, profileResult.values);
      }

      this._chart.render();
      this._chartLegend.refresh();
    },

    /**
     * Clears the chart
     * @private
     */
    _clearChart: function () {
      if (!this._chart) {
        return;
      }
      var i;
      for (i = 0; i < this._chart.series.length; i++) {
        this._chart.updateSeries(this._chart.series[i].name, []);
      }

      this._chart.render();
      this._chartLegend.refresh();
    },

    /**
     * Clears the hover indicators on the profile chart
     * @private
     */
    _clearIndicators: function () {
      // REMOVE ELEVATION INDICATORS //
      if (this._valueIndicator) {
        array.forEach(this._valueIndicator, function (vIndicator) {
          vIndicator.destroy();
          vIndicator = null;
        });
        this._valueIndicator = [];
      }
    },

    /**
     * Updates the values of the indicators on the profile chart
     *
     * markerSymbol for the chart elevation indicator is defined using SVG (examples):
     * CIRCLE:            "m-3,0 c0,-4 6,-4 6,0 m-6,0 c0,4 6,4 6,0",
     * SQUARE:            "m-3,-3 l0,6 6,0 0,-6 z",
     * DIAMOND:           "m0,-3 l3,3 -3,3 -3,-3 z",
     * CROSS:             "m0,-3 l0,6 m-3,-3 l6,0",
     * X:                 "m-3,-3 l6,6 m0,-6 l-6,6",
     * TRIANGLE:          "m-3,3 l3,-6 3,6 z",
     * TRIANGLE_INVERTED: "m-3,-3 l3,6 3,-6 z"
     *
     * @private
     */
    _updateIndicators: function () {

      if (this._chart) {
        //Clear elevation indicators
        this._clearIndicators();

        //mouse/touch indicators
        var detailsNumberFormat = { places: 1 };
        var valueIndicatorProperties = {
          mouseOver: true,
          font: "normal normal bold 8pt Tahoma",
          fontColor: this._chartRenderingOptions.indicatorFontColor,
          fill: this._chartRenderingOptions.indicatorFillColor,
          markerFill: "none",
          markerStroke: { color: this._chartRenderingOptions.indicatorMarkerStrokeColor, width: 3.0 },
          markerSymbol: this._chartRenderingOptions.indicatorMarkerSymbol
        };

        var xIndicatorProperties = {
          series: this.SERIES_NAME_DIMENSIONS + "_0",
          start: true,
          offset: { y: 0, x: 0 },
          labelFunc: lang.hitch(this, this._chartTooltipForX)
        };

        if (esriSniff("has-touch")) {
          //  this._valueIndicator = new TouchIndicator(this._chart, "default", valueIndicatorProperties);
          //  on(this.domNode, mouse.enter, lang.hitch(this, this._displayChartLocation, null));
          //  on(this.domNode, mouse.leave, lang.hitch(this, this._displayChartLocation, null));
        }
        else {
          var sIdx = 0;
          var yOffset = 20;
          for (sIdx; sIdx < this._profileResults.length; sIdx++) {
            var seriesLegend = this._getSeriesLegend(this.SERIES_NAME_DIMENSIONS + "_" + sIdx);
            var labelInfo = {
              label: seriesLegend || this._chartRenderingOptions.yAxisTitle
            };
            var yIndicatorProperties = {
              labelFunc: lang.hitch(labelInfo, this._chartTooltipForY)
            };
            var indicatorProperties = lang.mixin(
              { series: this.SERIES_NAME_DIMENSIONS + "_" + sIdx, offset: { x: 10, y: yOffset * (sIdx + 1) } },
              yIndicatorProperties, valueIndicatorProperties);
            this._valueIndicator.push(new MouseIndicator(this._chart, "default", indicatorProperties));
          }

          //var xMouseIndicator = new MouseIndicator(this._chart, "default", lang.mixin(xIndicatorProperties, valueIndicatorProperties));
          //xMouseIndicator._uName = "mouseIndicatorDimensions_x0";
          //this._valueIndicator.push(xMouseIndicator);
        }
        this._chart.fullRender();
      }
    },

    _getSeriesLegend: function (seriesName) {
      var series = this._chart.getSeries(seriesName);
      return series ? series.legend : "";
    },

    _createNewMapGraphic: function (geometry) {
      if (!this._map || !geometry) {
        return;
      }

      var indicatorSymbol = this._chartRenderingOptions.profileGeometrySymbol;
      var mapSymbol = indicatorSymbol.hasOwnProperty("type") ? indicatorSymbol : indicatorSymbol.toJson();
      if (mapSymbol.type !== "esriSMS" && mapSymbol.type !== "esriPMS") {
        mapSymbol = this._defaultMapSymbol;
      }

      var newGraphic = new Graphic({
        geometry: geometry,
        symbol: mapSymbol
      });

      return newGraphic;
    },

    /**
     * Display input geometry as a red X graphic on map. Check if
     * SimpleMarkerSymbol or PictureMarkerSymbol should be used.
     * @private
     */
    _drawProfileGeometryOnMap: function (graphic) {
      if (!this._map || !graphic || !this._drawProfileGeometry) {
        return;
      }

      if (this._mapGraphics.length === this._maxResultCount) {
        // pop the oldest result
        var oldestGraphic = this._mapGraphics[0];
        this._map.graphics.remove(oldestGraphic);
        this._mapGraphics.shift();
      }

      this._mapGraphics.push(graphic);
      this._map.graphics.add(graphic);
    },

    _updateGraphic: function (profileResult) {
      if (!profileResult || !profileResult.graphic) {
        return;
      }

      var graphic = profileResult.graphic,
          series = profileResult.series;

      if (series) {  //graphic.symbol === this._defaultMapSymbol
        // apply profile lines color scheme
        graphic.symbol.color = new Color(series.stroke);    // [255, 87, 34, 1]
        graphic.symbol.outline.color = new Color(series.stroke);    // [255, 87, 34, 1]
        graphic.draw();
      }
    },

    /**
      * Clear all geometries displayed on the map
      * @private
      */
    _clearProfileGeometriesOnMap: function () {
      if (!this._mapGraphics) {
        return;
      }
      array.forEach(this._mapGraphics, function (graphic) {
        this._map.graphics.remove(graphic);
      }.bind(this));
      this._mapGraphics = [];
    },

    /**
     * Display chart location as a red X graphic on map. Check if
     * SimpleMarkerSymbol or PictureMarkerSymbol should be used.
     * @param {Number} chartObjectX
     * @private
     */
    _displayChartLocation: function (chartObjectX) {
      if (this._map && this._profileResults.values && this._profileResults.geometry) {
        if (!this._chartLocationGraphic) {
          // Create location graphic
          var indicatorSymbol = this._chartRenderingOptions.mapIndicatorSymbol;
          var mapSymbol = indicatorSymbol.hasOwnProperty("type") ? indicatorSymbol : indicatorSymbol.toJson();
          if (mapSymbol.type !== "esriSMS" && mapSymbol.type !== "esriPMS") {
            mapSymbol = this._defaultMapSymbol;
          }
          this._chartLocationGraphic = new Graphic({
            geometry: null,
            symbol: mapSymbol
          });
          if (!this._chartLocationGraphicsLayer) {
            this._chartLocationGraphicsLayer = new GraphicsLayer();
            this._map.addLayer(this._chartLocationGraphicsLayer);
          }
          this._chartLocationGraphicsLayer.add(this._chartLocationGraphic);
        }

        //// Set geometry of chart location graphic
        //var distanceIndex = (this._profileResults.distances) ? array.indexOf(this._profileResults.distances, chartObjectX) : -1;
        //if (distanceIndex >= 0) {
        //  var elevData = this._profileResults.elevations[distanceIndex];
        //  this._chartLocationGraphic.setGeometry(this._profileResults.geometry.getPoint(elevData.pathIdx, elevData.pointIdx));
        //}
        //else {
        //  //this._chartLocationGraphic.setGeometry(null);
        //  this._chartLocationGraphicsLayer.clear();
        //  this._chartLocationGraphic = null;
        //}
      }
    },

    _reduceProfileResults: function (profileResult) {
      var values = profileResult.values;
      if (!this._reduceDataPoints || values.length < (3 * this._samplingDataCount)) {
        return profileResult;
      }

      var reducedValues = [];
      var factor = this._samplingDataCount / 3;
      var size = Math.ceil((values.length) / factor),
          i = 0,
          minIdx, maxIdx,
          minX, minY,
          maxX, maxY,
          meanX, meanY;
      for (i = 0; i < size; i++) {
        minIdx = (i === 0) ? (i * factor) : (i * factor) + 1;
        maxIdx = (i + 1) * factor;
        minX = this._getArrayMin(values.slice(minIdx, maxIdx), "x");
        maxX = this._getArrayMax(values.slice(minIdx, maxIdx), "x");
        minY = this._getArrayMin(values.slice(minIdx, maxIdx), "y");
        maxY = this._getArrayMax(values.slice(minIdx, maxIdx), "y");
        meanX = (minX + maxX) / 2;
        meanY = (minY + maxY) / 2;
        //reducedValues.push({ "x": minX, "y": minY });
        reducedValues.push({ "x": meanX, "y": meanY });
        //reducedValues.push({ "x": maxX,  "y": maxY });
      }

      profileResult.values = reducedValues;
      return profileResult;
    },

    /**
     * Get maximum Y value in array
     * @param {[]} dataArray
     * @return {number}
     * @private
     */
    _getArrayMax: function (dataArray, property) {
      var values = array.map(dataArray, function (item) {
        return item[property];
      });
      return Math.max.apply(Math, values);
    },

    /**
     * GET MINIMUM Y VALUE IN ARRAY
     *
     * @param {[]} dataArray
     * @return {number}
     * @private
     */
    _getArrayMin: function (dataArray, property) {
      var values = array.map(dataArray, function (item) {
        return item[property];
      });
      return Math.min.apply(Math, values);
    },

    _getLayerVariable: function (layer) {
      var layerVariable = null;
      if (layer && layer.mosaicRule && layer.mosaicRule.multidimensionalDefinition && layer.mosaicRule.multidimensionalDefinition.length) {
        layerVariable = layer.mosaicRule.multidimensionalDefinition[0].variableName;
      }

      return layerVariable;
    },

    _getDefaultDimensionalRange: function () {
      var layer = this._layers[0].layer;
      if (!layer) {
        return;
      }

      var layerVariable = this._getLayerVariable(layer);
      var val = {
        min: 0.0,
        max: 100.0
      };

      return layer.getMultidimensionalInfo().then(function (result) {
        var mdInfo = result;
        if (mdInfo && mdInfo.variables && mdInfo.variables.length && layerVariable) {
          array.forEach(mdInfo.variables, function (variable) {
            if (variable.name.toLowerCase() === layerVariable.toLowerCase()) {
              array.forEach(variable.dimensions, function (dim) {
                if (dim.name.toLowerCase() === this.dimension.toLowerCase() && dim.extent && dim.extent.length === 2) {
                  val.min = dim.extent[0];
                  val.max = dim.extent[1];
                }
              }.bind(this));
            }
          }.bind(this));
        }
        return val;
      }.bind(this),
      function (error) {
        console.log(error);
        return val;
      });
    }
  });
});