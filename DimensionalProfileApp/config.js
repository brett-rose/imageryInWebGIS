/* Config file for the Dimensional Profile App */

define({
  title: "Sea Surface Temperature",           // The app title 
  description: "Visualizing change in temperature over a period of time at a given depth",     // The app description  
  webMapId: "791d2b1a20a94ea9bd206eb1b759dc62",
  timeSlider: {
   properties: {
     startTime: 1136116800000,
     endTime: 1432036800000,
     timeStopInterval: {
       interval: 1,
       units: "esriTimeUnitsMonths"
     }
   }
  },
  swipeLayerIndex: 1,                             // Define the activeLayer index, it's 0 based
  mdSliderDimension: "",                          // The dimension used for the vertical multi-dimensional slider
  chart: {
    layers: [{   // An array of objects of type {"title":"<The title of the layer in the webmap>", "renderingRule": "The renderingRule name to be applied"}
      title: "Sea Surface Temperature",
      variable: "analysed_sst",                // The variable used on the Y-Axis of the chart   
      renderingRule: null
    }],    
    dimension: "StdTime",                      // The dimension used on the X-Axis of the chart  
    options: {                                 // X and Y axis titles  
      xAxisTitle: "Time",
      yAxisTitle: "Temperature"
    }
  }
});

