// Constants
var ovenVendorId = '0x1f01';
var ovenProductId = '0x2012';
var ovenPnpVendorId = '1f01';  // for Windows
var ovenPnpProductId = '2012'; // for Windows

// Oven status
var connected = false;
var temperature = -1.0;
var setpoint = -1.0;
var oven_on = false;
var phase = 'unknown';

// Oven commands
var oven_on_cmd = false;
var oven_off_cmd = false;
var oven_pid_cmd = false;
var oven_setpoint_cmd = false;

// PID tunings
var preheat_kp = 0.0;
var preheat_ki = 0.0;
var preheat_kd = 0.0;
var soak_kp = 0.0;
var soak_ki = 0.0;
var soak_kd = 0.0;
var reflow_kp = 0.0;
var reflow_ki = 0.0;
var reflow_kd = 0.0;

// Setpoints
var preheat_setpoint = 0.0;
var preheat_duration = 0.0;
var soak_setpoint = 0.0;
var soak_duration = 0.0;
var reflow_setpoint = 0.0;
var reflow_duration = 0.0;

// Initialize libraries
const {ipcMain} = require('electron');
const serialport = require('serialport');

// Handle requests
ipcMain.on('get-status', (event, arg) => {
    event.returnValue = {
        'connected': connected,
        'phase': phase,
        'setpoint': setpoint,
        'temperature': temperature,
        'oven_on': oven_on
    }
});

ipcMain.on('set-status', (event, arg) => {
    if(arg.oven_on) {
        oven_on_cmd = true;
    }
    else {
        oven_off_cmd = true;
    }
});

ipcMain.on('set-setpoints', (event, arg) => {
    preheat_setpoint = arg.preheat.setpoint;
    soak_setpoint = arg.soak.setpoint;
    reflow_setpoint = arg.reflow.setpoint;

    preheat_duration = arg.preheat.duration;
    soak_duration = arg.soak.duration;
    reflow_duration = arg.reflow.duration;

    oven_setpoint_cmd = true;
});

// Parsers
function parseTemperature(dataline) {
    var index = 0;
    var temp = -1.0;
    if((index = dataline.indexOf('Waiting  - ')) >= 0) {
        temp = parseFloat(dataline.substr(index + 11, index + 17));
    } else if((index = dataline.indexOf('CURR ')) >= 0) {
        temp = parseFloat(dataline.substr(index + 5, index + 11));
    }

    console.log("Temp = " + temp + "\u00B0C");

    return temp;
}

function parseSetpoint(dataline) {
    var index = 0;
    if((index = dataline.indexOf('SET ')) >= 0) {
        return parseFloat(dataline.substr(index + 4, index + 10));
    }

    return -1.0;
}

function parseOvenOn(dataline) {
    return dataline.indexOf("OVEN ON") >= 0;
}

function parseOvenPhase(dataline) {
    if(dataline.indexOf("PREHEAT") >= 0) {
        return 'Preheat';
    }
    else if(dataline.indexOf("SOAK") >= 0) {
        return 'Soak';
    }
    else if(dataline.indexOf("REFLOW") >= 0) {
        return 'Reflow';
    }
    else if(dataline.indexOf("COOLDOWN") >= 0) {
        return 'Cooldown';
    }
    else if(dataline.indexOf("Waiting") >= 0) {
        return 'Ready';
    }

    return 'unknown';
}

// Find the connected reflow oven, connect to it, and start updating the global status variables
serialport.list(function (err, ports) {
    for(var i = 0; i < ports.length; i++) {
        var match = false;
        var pnp_match = false;

        if(ports[i].vendorId && ports[i].productId) {
            match = (ports[i].vendorId.toLowerCase() == ovenVendorId && ports[i].productId.toLowerCase() == ovenProductId);
        }

        if(ports[i].pnpId) {
            pnp_match = (ports[i].pnpId.toLowerCase().indexOf(ovenPnpVendorId) >= 0 && ports[i].pnpId.toLowerCase().indexOf(ovenPnpProductId) >= 0);
        }

        if(match || pnp_match) {
            var oven = new serialport.SerialPort(ports[i].comName);

            oven.on('open', function() {
                connected = true;

                if(ports[i].comName) {
                    console.log('Connected to reflow oven at %s', ports[i].comName);
                } else {
                    console.log('Connected to reflow oven');
                }

                oven.write('hello\r'); // First command is never recognized

                var dataline = '';

                oven.on('data', function(data) {
                    var received = data.toString();

                    for(var i = 0; i < received.length; i++) {
                        if(received.charAt(i) == '\r' || received.charAt(i) == '\n') {
                            if(dataline.length > 0) {
                                // Parse data
                                temperature = parseTemperature(dataline);
                                setpoint = parseSetpoint(dataline);
                                oven_on = parseOvenOn(dataline);
                                phase = parseOvenPhase(dataline);

                                // Send commands if any
                                if(oven_on_cmd)
                                {
                                    oven.write('start\r');
                                    oven_on_cmd = false;
                                }
                                if(oven_off_cmd)
                                {
                                    oven.write('stop\r');
                                    oven_off_cmd = false;
                                }
                                if(oven_pid_cmd)
                                {
                                    oven.write('pid: pp ' + preheat_kp + '\r');
                                    oven.write('pid: pi ' + preheat_ki + '\r');
                                    oven.write('pid: pd ' + preheat_kd + '\r');

                                    oven.write('pid: sp ' + soak_kp + '\r');
                                    oven.write('pid: si ' + soak_ki + '\r');
                                    oven.write('pid: sd ' + soak_kd + '\r');

                                    oven.write('pid: rp ' + reflow_kp + '\r');
                                    oven.write('pid: ri ' + reflow_ki + '\r');
                                    oven.write('pid: rd ' + reflow_kd + '\r');

                                    oven_pid_cmd = false;
                                }
                                if(oven_setpoint_cmd)
                                {
                                    oven.write('setp: p ' + preheat_setpoint + '\r');
                                    oven.write('setp: s ' + soak_setpoint + '\r');
                                    oven.write('setp: r ' + reflow_setpoint + '\r');

                                    oven.write('dur: p ' + preheat_duration + '\r');
                                    oven.write('dur: s ' + soak_duration + '\r');
                                    oven.write('dur: r ' + reflow_duration + '\r');

                                    oven_setpoint_cmd = false;
                                }
                            }

                            dataline = '';
                        } else {
                            dataline += received.charAt(i);
                        }
                    }
                });
            });

            break;
        }
    }
});
