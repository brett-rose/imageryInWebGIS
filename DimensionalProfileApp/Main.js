/* Main JS code */
define([
      "applicationJS/dijit/DimensionalProfile/MultiDimensionalProfile",
      "esri/dijit/MultidimensionalSlider",
      "esri/map",
      "esri/layers/ArcGISImageServiceLayer",
      "esri/layers/ImageServiceParameters",
      "dojo/dnd/Moveable",
      "dojo/_base/url",
      "esri/request",
      "esri/TimeExtent",
      "esri/dijit/TimeSlider",
      "esri/dijit/LayerSwipe",
      "dojo/_base/array",
      "dojo/Deferred",
      "dijit/registry",
      "dijit/Dialog",
      "esri/graphic",
      "esri/geometry/Extent",
      "dojox/charting/Chart",
      "dojox/charting/axis2d/Default",
      "dojox/charting/plot2d/Markers",
      "dojox/charting/themes/PurpleRain",
      "dojox/charting/action2d/Tooltip",
      "dojo/_base/fx",
      "dojo/dom",
      "dojo/dom-style",
      "dojo/dom-class",
      "dojo/parser", "dojo/on", "dojo/_base/lang", "dojo/_base/declare"
], function(
  DimensionalProfile, MdSlider,
  Map, ImageServiceLayer, ImageServiceParameters,
  Moveable, Url, 
  esriRequest, TimeExtent, TimeSlider, LayerSwipe, array, Deferred, registry, Dialog,
  Graphic, Extent,
  Chart, Default, Markers, Wetland, Tooltip,
  baseFx, dom, domStyle, domClass, parser, on, lang, declare) {

  return declare(null, {
    map: null,
    operationalLayers: null,
    layers: [],
    mdSlider: null,
    timeSlider: null,

    timeSliderOptions: null,
    chartOptions: null,
    swipeLayerIndex: 1,
    mdSliderDimension: null,
    chartDimension: null,

    profileWidget: null,
    gsUrl: null,

    _defaultTimeSliderOptions:   {
        startTime: null,
        endTime: null,
        timeStopInterval: {
          interval: 1,
          units: "esriTimeUnitsMonths"
        }
    },

    startup: function(options) {
      if (!options.map || !options.operationalLayers || !options.chart.layers) {
        return;
      }

      this.map = options.map;
      this.operationalLayers = options.operationalLayers;
      this.mdSliderDimension = options.mdSliderDimension; // || "StdZ";
      this.swipeLayerIndex = options.swipeLayerIndex || 1;
      this.timeSliderOptions = lang.mixin(lang.clone(this._defaultTimeSliderOptions), options.timeSlider.properties);
      this.chartDimension = options.chart.dimension || "StdTime";
      this.chartOptions = options.chart.options;

      on(window, "resize", function() {
        registry.byId("dimChartDiv").resize();
      });

      if (!options.title && !options.description) {
        dom.byId("headerPane").style.display = "none";
      } else {
        if (options.title) {
          dom.byId("appTitle").innerHTML = options.title;
        }
        if (options.description) {
          dom.byId("appDesc").innerHTML = options.description;
        }
        dom.byId("headerPane").style.display = "block";
      }

      // Add layers
      var corsEnabledServers, imageServiceAuthority, exportWebmapServiceAuthority, onceDone;
      corsEnabledServers = esriConfig.defaults.io.corsEnabledServers;
      var addLayerEvents = true;
      options.chart.layers.forEach(lang.hitch(this, function(layerJSON) {

        if (!layerJSON || (!layerJSON.url && !layerJSON.title)) {
          return;
        }

        var layer;
        if (layerJSON.url) {
          // Add IS layer
          layer = this.addLayerToMap(layerJSON.url, layerJSON.renderingRule);

          imageServiceAuthority = new Url(layer.url).authority;
          if (!corsEnabledServers.some(function(x) {
            return x === imageServiceAuthority;
          })) {
            corsEnabledServers.push(imageServiceAuthority);
          }
          if (addLayerEvents) {
            layer.on("load", lang.hitch(this, function(loadOptions) {
              this.createTimeSlider(loadOptions.layer);
            }));

            layer.on("update-start", lang.hitch(this, function() {
              //this.drawProfile();
            }));
          }
        } else {
          layer = this.getLayerFromWebMap(this.map, this.operationalLayers, layerJSON.title);
          if (!layer) {
            this.displayMessage("Missing layer", "Layer '" + layerJSON.title + "' is not found.");
          }
          if (layer && addLayerEvents) {
            this.createTimeSlider(layer);
          }
        }

        if (layer) {          
          //layer.setUseMapTime(true);
          this.layers.push({ layer: layer, options: layerJSON } );
          addLayerEvents = false; //Add these events for the primary layer
        }
      }));

      this.createDimensionalProfile();

      this.map.on("click", lang.hitch(this, function(evt) {
        if (evt.ctrlKey) {
          var mapPoint = evt.mapPoint;
          mapPoint.x = this.map.extent._normalizeX(mapPoint.x, this.map.extent.spatialReference._getInfo()).x;
          this.drawProfile(mapPoint);
        }
      }));

      // Hide or show profile when button is clicked. 
      var profileToggle = dom.byId("toggleProfile");
      profileToggle.title = "Show/Hide pane"; //this.config.i18n.elevation.toggle;
      on(profileToggle, "click", lang.hitch(this, function() {
        this.togglePanel("panelContent");
      }));

      // Clear profile when button is clicked. 
      var clearProfileBtn = dom.byId("clearProfile");
      clearProfileBtn.title = "Clear the profile"; //this.config.i18n.elevation.toggle;
      on(clearProfileBtn, "click", this.clearProfile.bind(this));

      registry.byId("main").layout();
    },

    getLayerFromWebMap: function(map, operationalLayers, layerTitle) {
      if (!map || !operationalLayers) {
        return;
      }
      
      var layer;
      operationalLayers.forEach(function(opLayer) {
        if (opLayer.title === layerTitle) {
          layer = map.getLayer(opLayer.id);
        }
      });

      return layer;
    },

    addLayerToMap: function(url, renderingRule) {

      var isParameters = {};

      if (this.mdSliderDimension) {
        isParameters.activeMapDimensions = [this.mdSliderDimension];
      }

      // This is being done later
      //if (renderingRule) {
      //  var rFunction = new RasterFunction();
      //  rFunction.functionName = renderingRule;
      //  isParameters.imageServiceParameters = new ImageServiceParameters();
      //  isParameters.imageServiceParameters.renderingRule = rFunction;
      //}

      var layer = new ImageServiceLayer(url, isParameters);
      this.map.addLayer(layer);
      return layer;
    },

    createTimeSlider: function (layer) {
      //this.setISLayerExtent();

      // create dimensional slider
      var mdSliderDiv = document.getElementById("mdSlider");
      if (this.mdSliderDimension) {
        this.mdSlider = new MdSlider({
          map: this.map,
          dimension: this.mdSliderDimension,
          layout: MdSlider.LAYOUT_VERTICAL,
          thumbCount: 1,
          showPlayButton: true
        }, "mdSlider");

        this.mdSlider.startup();
        var moveableSlider = new Moveable(mdSliderDiv);
      } else {
        mdSliderDiv.style.display = "none";
      }

      // create time slider
      dom.byId("timePanel").style.display = "block";
      //var tsDiv = dojo.create("div", null, dojo.byId('timeSliderDiv'));
      var timeSlider = new TimeSlider({
        id: 'timeSlider',
        style: 'width: 100%',
        thumbCount: 2,
        loop: true
      }, dom.byId("timeSliderDiv"));

      this.map.setTimeSlider(timeSlider);
      var timeExtent = layer.timeInfo.timeExtent;
      if (this.timeSliderOptions.startTime && this.timeSliderOptions.endTime) {
        timeExtent = new TimeExtent(new Date(this.timeSliderOptions.startTime), new Date(this.timeSliderOptions.endTime));
      }
      timeSlider.createTimeStopsByTimeInterval(timeExtent, this.timeSliderOptions.timeStopInterval.interval, this.timeSliderOptions.timeStopInterval.units);
      timeSlider.startup();

      this.setTimeString(this.map.timeExtent);
      timeSlider.on('time-extent-change', lang.hitch(this, function(args) {
        this.setTimeString(args);
      }));
    },

    createDimensionalProfile: function () {
      // create swipe layer
      if (this.swipeLayerIndex > -1 && this.layers.length > 1) {
        var swipeWidget = new LayerSwipe({
          type: "vertical",  //Try switching to "scope" or "horizontal" or "vertical"
          map: this.map,
          layers: [this.layers[this.swipeLayerIndex].layer],
          left: 5
        }, "swipeDiv");
        swipeWidget.startup();
      }

      // create dim profile
      dom.byId("panelContainer").style.display = "block";
      domClass.add(dom.byId("panelContainer"), "bottom-center");
      var profileParams = {
        map: this.map,
        layers: this.layers,
        dimension: this.chartDimension,
        chartOptions: this.chartOptions
      };
      this.profileWidget = new DimensionalProfile(profileParams, "dimChartDiv");
      this.profileWidget.startup();
      this.profileWidget.on("update", this.showProfilePane.bind(this));
    },

    drawProfile: function(mapPoint) {
      if (!mapPoint) {
        return;
      }

      this.profileWidget.set("profileGeometry", mapPoint);
    },

    showProfilePane: function() {
      //open profile chart if closed
      var element = dom.byId("panelContent");
      var height = domStyle.get(dom.byId("panelContent"), "height");
      if (height <= 0) {
        this.togglePanel("panelContent");
      }
    },

    clearProfile: function() {
      //this.map.graphics.clear();
      if (this.profileWidget) {
        this.profileWidget.clear();
      }
    },

    togglePanel: function(chartNode) {
      var element = dom.byId(chartNode),
          height = domStyle.get(element, "height"),
          opacity = parseInt(domStyle.get(element, "opacity")),
          visibility = domStyle.get(element, "visibility");

      var btn = dom.byId("toggleProfile");
      // Toggle Active 
      domClass.toggle("toggleProfile", "active");

      baseFx.animateProperty({
        node: dom.byId(chartNode),
        duration: 500,
        properties: {
          height: height === 0 ? 375 : 0
        },
        onBegin: function() {
          // hide the panel if showing when animation starts
          if (opacity === 1) {
            domStyle.set(element, "opacity", "0");
          }
        },
        onEnd: function() {
          // when height animation ends show/hide panel
          domStyle.set(element, "opacity", opacity === 0 ? 1 : 0);
          domStyle.set(element, "visibility", visibility === "hidden" ? "visible" : "hidden");
        }
      }).play();
    },

    setTimeString: function(args) {
      dojo.byId("timeValue").innerHTML = "<b>Time: </b>" + (args.startTime.toUTCString().substring(5, 22) + " to " + args.endTime.toUTCString().substring(5, 22));
    },

    setISLayerExtent: function() {
      if (this.layers[0].fullExtent.spatialReference.equals(this.map.spatialReference)) {
        this.map.setExtent(this.layers[0].fullExtent);
      } else {
        var corsEnabledServers, geometryServiceAuthority;
        corsEnabledServers = esriConfig.defaults.io.corsEnabledServers;
        this.gsUrl = "http://sampleserver6.arcgisonline.com/arcgis/rest/services/Utilities/Geometry/GeometryServer";
        geometryServiceAuthority = new Url(this.gsUrl).authority;
        if (!corsEnabledServers.some(function(x) {
          return x === geometryServiceAuthority;
        })) {
          corsEnabledServers.push(geometryServiceAuthority);
        }
        esriRequest({
          url: this.gsUrl + "/project",
          handleAs: "json",
          content: {
            f: "json",
            geometries: JSON.stringify({
              geometryType: "esriGeometryEnvelope",
              geometries: [this.layers[0].fullExtent.toJson()]
            }),
            inSR: JSON.stringify(this.layers[0].fullExtent.spatialReference.toJson()),
            outSR: JSON.stringify(this.map.spatialReference.toJson())
          },
          load: function(response) {
            this.map.setExtent(new Extent(response.geometries[0]).setSpatialReference(this.map.spatialReference));
          },
          error: function() {
          }
        });
      }
    },

    getDefaultChartOptions: function() {
      return {
        title: " ",
        axisFontColor: this.config.axisFontColor,
        titleFontColor: this.config.titleFontColor,
        axisMajorTickColor: this.config.axisMajorTickColor,
        elevationLineColor: this.config.elevationLineColor,
        elevationBottomColor: this.config.elevationBottomColor,
        elevationTopColor: this.config.elevationTopColor,
        skyBottomColor: this.config.skyBottomColor,
        skyTopColor: this.config.skyTopColor,
        elevationMarkerStrokeColor: "#00FFFF",
        indicatorFontColor: "#fff",
        indicatorFillColor: "#666",
        mapIndicatorSymbol: {
          type: "esriSMS",
          style: "esriSMSCircle",
          color: [0, 183, 235],
          size: 12,
          outline: {
            type: "esriSLS",
            style: "esriSLSolid",
            color: [255, 255, 255],
            width: 1
          }
        }
      };
    },

    displayMessage: function (title, content) {
      var myDialog = new Dialog({
        title: title,
        content: content,
        style: "width: 300px"
      });

      myDialog.show();
    }

  });
});