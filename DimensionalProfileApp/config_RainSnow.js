/* Config file for the Dimensional Profile App */

define({
  title: "GLDAS Precipitation 2000 - Present",           // The app title 
  description: "Visualizing change in precipitation over time",     // The app description  
  webMapId: "ca9b91b67dd94cdd9e1d0ba54b071156",
  timeSlider: {
   properties: {
     startTime: 951912000000,
     endTime: 1450180800000,
     timeStopInterval: {
       interval: 1,
       units: "esriTimeUnitsMonths"
     }
   }
  },
  swipeLayerIndex: -1,                             // Define the activeLayer index, it's 0 based
  mdSliderDimension: "",                          // The dimension used for the vertical multi-dimensional slider
  chart: {
    layers: [{   // An array of objects of type {"title":"<The title of the layer in the webmap>", "renderingRule": "The renderingRule name to be applied"}
      title: "Precipitation",
      variable: null,                // The variable used on the Y-Axis of the chart   
      renderingRule: "Rain",
      useMapTime: false,              // if not defined then layer's useMapTime property is used
      legendLabel: "Rain",
      seriesColor: "#284B70"  //blue
    }, {
      title: "Precipitation",
      variable: null,                // The variable used on the Y-Axis of the chart   
      renderingRule: "Snow",
      useMapTime: false,
      legendLabel: "Snow",
      seriesColor: "#702828"   //Maroon
    }],
    dimension: "StdTime",                      // The dimension used on the X-Axis of the chart  
    options: {                                 // X and Y axis titles  
      xAxisTitle: "Time",
      yAxisTitle: "Rain and Snow"
    }
  }
});

