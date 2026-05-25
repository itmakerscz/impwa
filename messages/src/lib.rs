use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct DeviceMetrics {
    pub device_id: String,
    pub data_points: Vec<f32>,
    pub timestamp: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CalculationResult {
    pub average: f32,
    pub status: String,
}

// Process incoming network data passed from JavaScript
#[wasm_bindgen]
pub fn process_incoming_metrics(js_val: JsValue) -> JsValue {
    let metrics: DeviceMetrics = serde_wasm_bindgen::from_value(js_val)
        .unwrap_or_else(|_| panic!("Failed to parse metrics struct from JS"));
        
    let count = metrics.data_points.len() as f32;
    let sum: f32 = metrics.data_points.iter().sum();
    let average = if count > 0.0 { sum / count } else { 0.0 };

    let result = CalculationResult {
        average,
        status: format!("Successfully processed {} points from {}", count, metrics.device_id),
    };

    serde_wasm_bindgen::to_value(&result).unwrap()
}

// Generate an outbound sample packet to pass over WebRTC
#[wasm_bindgen]
pub fn generate_outbound_metrics(id: String) -> JsValue {
    let outbound = DeviceMetrics {
        device_id: id,
        data_points: vec![102.4, 98.6, 110.1, 105.3],
        timestamp: 1779714871, // 2026 Epoch representation
    };
    serde_wasm_bindgen::to_value(&outbound).unwrap()
}