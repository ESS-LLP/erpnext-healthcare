frappe.provide("frappe.patient_history");
frappe.pages['patient_history'].on_page_load = function(wrapper) {
	var me = this;
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Patient History',
		single_column: true
	});

	frappe.breadcrumbs.add("Healthcare");

	page.main.html(frappe.render_template("patient_history", {}));
	var patient = frappe.ui.form.make_control({
		parent: page.main.find(".patient"),
		df: {
			fieldtype: "Link",
			options: "Patient",
			fieldname: "patient",
			change: function(){
				get_documents(patient.get_value(), me);
				show_patient_info(patient.get_value(), me);
				show_chart_btns_html = "<a class='btn btn-default btn-xs btn-show-chart' \
				data-show-chart-id='bp' data-pts='mmHg' data-title='Blood Pressure'>Blood Pressure</a>\
				<a class='btn btn-default btn-xs btn-show-chart' data-show-chart-id='pulse_rate' \
				data-pts='per Minutes' data-title='Respiratory/Pulse Rate'>Respiratory/Pulse Rate</a>\
				<a class='btn btn-default btn-xs btn-show-chart' data-show-chart-id='temperature' \
				data-pts='°C or °F' data-title='Temperature'>Temperature</a>\
				<a class='btn btn-default btn-xs btn-show-chart' data-show-chart-id='bmi' \
				data-pts='bmi' data-title='BMI'>BMI</a>"
				me.page.main.find(".show_chart_btns").html(show_chart_btns_html);
				show_patient_vital_charts(patient.get_value(), me, "bp", "mmHg", "Blood Pressure");
			}
		},
		only_input: true,
	});
	patient.refresh();

	this.page.main.on("click", ".btn-show-chart", function() {
		var	btn_show_id = $(this).attr("data-show-chart-id"), pts = $(this).attr("data-pts");
		var title = $(this).attr("data-title");
		show_patient_vital_charts(patient.get_value(), me, btn_show_id, pts, title);
	});

	this.page.main.on("click", ".btn-more", function() {
		var	doctype = $(this).attr("data-doctype"), docname = $(this).attr("data-docname");
		if(doctype && docname){
			frappe.call({
				method: "erpnext.healthcare.utils.render_doc_as_html",
				args:{
					doctype: doctype,
					docname: docname
				},
				callback: function(r) {
					if (r.message){
						me.page.main.find("."+docname).html(r.message.html+"<div align='center'><a class='btn octicon octicon-chevron-up btn-default btn-xs btn-less'\
						data-doctype='"+doctype+"' data-docname='"+docname+"'></a></div>");
					}else{
						// me.page.main.find(".patient_details").html("");
					}
				}
			});
		}
	});

	this.page.main.on("click", ".btn-less", function() {
		var	doctype = $(this).attr("data-doctype"), docname = $(this).attr("data-docname");
		if(doctype && docname){
			frappe.call({
				method: "erpnext.healthcare.page.patient_history.patient_history.get_feed_for_dt",
				args:{
					doctype: doctype,
					docname: docname
				},
				callback: function(r) {
					if (r.message){
						data = r.message
						let label = "<b>"+data[0].reference_doctype+" ("+data[0].reference_name+")</b>"
						if(data[0].subject){
							label += "<br/>"+data[0].subject;
						}
						me.page.main.find("."+docname).html(label+"<div align='center'><a class='btn octicon octicon-chevron-down btn-default btn-xs btn-more'\
						data-doctype='"+data[0].reference_doctype+"' data-docname='"+data[0].reference_name+"'></a></div>");
					}
				}
			});
		}
	});
}

var get_documents = function(patient, me){
	frappe.call({
		"method": "erpnext.healthcare.page.patient_history.patient_history.get_feed",
		args: {
			name: patient
		},
		callback: function (r) {
			var data = r.message;
			var details = "";
			var patient_details = "";
			if(data){
				details += "<ul class='nav nav-pills nav-stacked'>";
				var i;
				for(i=0; i<data.length; i++){
					if(data[i].reference_doctype){
						let label = "<b>"+data[i].reference_doctype+" ("+data[i].reference_name+")</b>"
						if(data[i].subject){
							label += "<br/>"+data[i].subject;
						}
						data[i] = add_date_separator(data[i])
						if(data[i].practitioner_user){
							data[i].imgsrc = frappe.utils.get_file_link(frappe.user_info(data[i].practitioner_user).image);
						}
						else{
							data[i].imgsrc = 'https://avatars1.githubusercontent.com/u/3784093?s=64&v=4';
						}
						var time_line_heading = `<a>${data[i].practitioner}</a>`;
						if(data[i].reference_doctype == "Patient Encounter"){
							time_line_heading += ` done <a>${data[i].reference_doctype}</a> `
						}
						else if(data[i].reference_doctype == "Vital Signs"){
							time_line_heading = ` <a>${data[i].reference_doctype}</a> marked`
						}
						else if(data[i].reference_doctype == "Lab Test"){
							time_line_heading += ` rase a <a>${data[i].reference_doctype}</a>`
						}
						else if(data[i].reference_doctype == "Clinical Procedure"){
							time_line_heading += ` done <a>${data[i].reference_doctype}</a> `
						}
						details += `<li data-toggle='pill' class='patient_doc_menu'
						data-doctype='${data[i].reference_doctype}' data-docname='${data[i].reference_name}'>
						<div class='col-sm-12 d-flex border-bottom py-3'>
							<span class='mr-3'>
								<a>
									<img class='avtar' src='${data[i].imgsrc}' width='32' height='32'>
									</img>
								</a>
							</span>
							<div class='d-flex flex-column width-full'>
								<div>
									`+time_line_heading+` on
										<!--<span class='${data[i].date_class}'>${data[i].date_sep}</span>-->
										<span>
											${data[i].date_sep}
										</span>
								</div>
								<div class='Box p-3 mt-2'>
									<span class='${data[i].reference_name}'>${label}
										<div align='center'>
											<a class='btn octicon octicon-chevron-down btn-default btn-xs btn-more'
												data-doctype='${data[i].reference_doctype}' data-docname='${data[i].reference_name}'>
											</a>
										</div>
									</span>
									<!-- <div align='center'>
										<a class='btn octicon octicon-chevron-down btn-default btn-xs btn-more'
											data-doctype='${data[i].reference_doctype}' data-docname='${data[i].reference_name}'>
										</a>
									</div> -->
								</div>
							</div>
						</div>
						</li>`

					}
				}
				details += "</ul>";
			}
			me.page.main.find(".patient_documents_list").html(details);
		}
	});
};

var add_date_separator = function(data) {
	var date = frappe.datetime.str_to_obj(data.creation);

	var diff = frappe.datetime.get_day_diff(frappe.datetime.get_today(), frappe.datetime.obj_to_str(date));
	if(diff < 1) {
		var pdate = 'Today';
	} else if(diff < 2) {
		pdate = 'Yesterday';
	} else {
		pdate = frappe.datetime.global_date_format(date);
	}
	data.date_sep = pdate;
	data.date_class = pdate=='Today' ? "date-indicator blue" : "date-indicator";
	return data
}

var show_patient_info = function(patient, me){
	frappe.call({
		"method": "erpnext.healthcare.doctype.patient.patient.get_patient_detail",
		args: {
			patient: patient
		},
		callback: function (r) {
			var data = r.message;
			var details = "";
			if(data.email) details += "<br><b>Email :</b> " + data.email;
			if(data.mobile) details += "<br><b>Mobile :</b> " + data.mobile;
			if(data.occupation) details += "<br><b>Occupation :</b> " + data.occupation;
			if(data.blood_group) details += "<br><b>Blood group : </b> " + data.blood_group;
			if(data.allergies) details +=  "<br><br><b>Allergies : </b> "+  data.allergies;
			if(data.medication) details +=  "<br><b>Medication : </b> "+  data.medication;
			if(data.alcohol_current_use) details +=  "<br><br><b>Alcohol use : </b> "+  data.alcohol_current_use;
			if(data.alcohol_past_use) details +=  "<br><b>Alcohol past use : </b> "+  data.alcohol_past_use;
			if(data.tobacco_current_use) details +=  "<br><b>Tobacco use : </b> "+  data.tobacco_current_use;
			if(data.tobacco_past_use) details +=  "<br><b>Tobacco past use : </b> "+  data.tobacco_past_use;
			if(data.medical_history) details +=  "<br><br><b>Medical history : </b> "+  data.medical_history;
			if(data.surgical_history) details +=  "<br><b>Surgical history : </b> "+  data.surgical_history;
			if(data.surrounding_factors) details +=  "<br><br><b>Occupational hazards : </b> "+  data.surrounding_factors;
			if(data.other_risk_factors) details += "<br><b>Other risk factors : </b> " + data.other_risk_factors;
			if(data.patient_details) details += "<br><br><b>More info : </b> " + data.patient_details;

			if(details){
				details = "<div style='padding-left:10px; font-size:13px;' align='center'></br><b class='text-muted'>Patient Details</b>" + details + "</div>";
			}
			me.page.main.find(".patient_details").html(details);
		}
	});
};

var show_patient_vital_charts = function(patient, me, btn_show_id, pts, title) {
	frappe.call({
		method: "erpnext.healthcare.utils.get_patient_vitals",
		args:{
			patient: patient
		},
		callback: function(r) {
			if (r.message){
				var data = r.message;
				let labels = [], datasets = [];
				let bp_systolic = [], bp_diastolic = [], temperature = [];
				let pulse = [], respiratory_rate = [], bmi = [], height = [], weight = [];
				for(i=0; i<data.length; i++){
					labels.push(data[i].signs_date+"||"+data[i].signs_time);
					if(btn_show_id=="bp"){
						bp_systolic.push(data[i].bp_systolic);
						bp_diastolic.push(data[i].bp_diastolic);
					}
					if(btn_show_id=="temperature"){
						temperature.push(data[i].temperature);
					}
					if(btn_show_id=="pulse_rate"){
						pulse.push(data[i].pulse);
						respiratory_rate.push(data[i].respiratory_rate);
					}
					if(btn_show_id=="bmi"){
						bmi.push(data[i].bmi);
						height.push(data[i].height);
						weight.push(data[i].weight);
					}
				}
				if(btn_show_id=="temperature"){
					datasets.push({name: "Temperature", values: temperature, chartType:'line'});
				}
				if(btn_show_id=="bmi"){
					datasets.push({name: "BMI", values: bmi, chartType:'line'});
					datasets.push({name: "Height", values: height, chartType:'bar'});
					datasets.push({name: "Weight", values: weight, chartType:'bar'});
				}
				if(btn_show_id=="bp"){
					datasets.push({name: "BP Systolic", values: bp_systolic, chartType:'line'});
					datasets.push({name: "BP Diastolic", values: bp_diastolic, chartType:'line'});
				}
				if(btn_show_id=="pulse_rate"){
					datasets.push({name: "Heart Rate / Pulse", values: pulse, chartType:'line'});
					datasets.push({name: "Respiratory Rate", values: respiratory_rate, chartType:'line'});
				}
				let chart = new Chart( ".patient_vital_charts", {
					data: {
						labels: labels,
						datasets: datasets
					},

					title: title,
					type: 'axis-mixed', // 'axis-mixed', 'bar', 'line', 'pie', 'percentage'
					height: 150,
					colors: ['purple', '#ffa3ef', 'light-blue'],

					tooltipOptions: {
						formatTooltipX: d => (d + '').toUpperCase(),
						formatTooltipY: d => d + ' ' + pts,
					}
				});
			}else{
				me.page.main.find(".patient_vital_charts").html("<div class='text-muted' align='center'>Nothing to show</div>");
			}
		}
	});
}
