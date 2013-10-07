// Плагин векторного слоя
L.TileLayer.gmxRasterLayer = L.TileLayer.Canvas.extend(
{
    initialize: function(options) {
        this.initPromise = new gmxDeferred();
    },
        
    onAdd: function(map) {
    },
    
    onRemove: function(map) {
    },
    
    //public interface
    initFromDescription: function(ph) {
    }
});