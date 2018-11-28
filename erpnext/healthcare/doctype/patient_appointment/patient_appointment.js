// Copyright (c) 2016, ESS LLP and contributors
// For license information, please see license.txt
frappe.provide('erpnext.queries');
frappe.ui.form.on('Patient Appointment', {
	setup: function(frm) {
		frm.custom_make_buttons = {
			'Vital Signs': 'Vital Signs',
			'Patient Encounter': 'Patient Encounter'
		};
	},

	onload: function(frm) {
		if (frm.is_new()) {
			frm.set_value('appointment_time', null);
			frm.disable_save();
		}
	},

	refresh: function(frm) {
		frm.set_query('patient', function () {
			return {
				filters: {'status': 'Active'}
			};
		});
		frm.set_query('practitioner', function() {
			return {
				filters: {
					'department': frm.doc.department
				}
			};
		});
		frm.set_query('service_unit', function(){
			return {
				filters: {
					'is_group': false,
					'allow_appointments': true,
					'company': frm.doc.company
				}
			};
		});

		if (frm.is_new()) {
			frm.page.set_primary_action(__('Check Availability'), function() {
				if (!frm.doc.patient) {
					frappe.msgprint({
						title: __('Not Allowed'),
						message: __('Please select Patient first'),
						indicator: 'red'
					});
				} else {
					frappe.call({
						method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.check_payment_fields_reqd',
						args: {'patient': frm.doc.patient},
						callback: function(data) {
							if (data.message == true) {
								if (frm.doc.mode_of_payment && frm.doc.paid_amount) {
									check_and_set_availability(frm);
								}
								if (!frm.doc.mode_of_payment) {
									frappe.msgprint({
										title: __('Not Allowed'),
										message: __('Please select a Mode of Payment first'),
										indicator: 'red'
									});
								}
								if (!frm.doc.paid_amount) {
									frappe.msgprint({
										title: __('Not Allowed'),
										message: __('Please set the Paid Amount first'),
										indicator: 'red'
									});
								}
							} else {
								check_and_set_availability(frm);
							}
						}
					});
				}
			});
		} else {
			frm.page.set_primary_action(__('Save'), () => frm.save());
		}

		if (frm.doc.patient) {
			frm.add_custom_button(__('Patient History'), function() {
				frappe.route_options = {'patient': frm.doc.patient};
				frappe.set_route('patient_history');
			}, __('View'));
		}

		if (frm.doc.status == 'Open' || (frm.doc.status == 'Scheduled' && !frm.doc.__islocal)) {
			frm.add_custom_button(__('Cancel'), function() {
				update_status(frm, 'Cancelled');
			});
			frm.add_custom_button(__('Reschedule'), function() {
				check_and_set_availability(frm);
			});

			if (frm.doc.procedure_template) {
				frm.add_custom_button(__('Clinical Procedure'), function(){
					frappe.model.open_mapped_doc({
						method: 'erpnext.healthcare.doctype.clinical_procedure.clinical_procedure.make_procedure',
						frm: frm,
					});
				}, __('Create'));
			} else if (frm.doc.therapy_type) {
				frm.add_custom_button(__('Therapy Session'),function(){
					frappe.model.open_mapped_doc({
						method: 'erpnext.healthcare.doctype.therapy_session.therapy_session.create_therapy_session',
						frm: frm,
					})
				}, 'Create');
			} else {
				frm.add_custom_button(__('Patient Encounter'), function() {
					frappe.model.open_mapped_doc({
						method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.make_encounter',
						frm: frm,
					});
				}, __('Create'));
			}

			frm.add_custom_button(__('Vital Signs'), function() {
				create_vital_signs(frm);
			}, __('Create'));
		}
		frm.set_df_property("get_procedure_from_encounter", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("service_unit", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("procedure_template", "read_only", frm.doc.__islocal ? 0 : 1);
	},

	patient: function(frm) {
		if (frm.doc.patient) {
			frm.trigger('toggle_payment_fields');
		} else {
			frm.set_value('patient_name', '');
			frm.set_value('patient_sex', '');
			frm.set_value('patient_age', '');
			frm.set_value('inpatient_record', '');
		}
	},

	therapy_type: function(frm) {
		if (frm.doc.therapy_type) {
			frappe.db.get_value('Therapy Type', frm.doc.therapy_type, 'default_duration', (r) => {
				if (r.default_duration) {
					frm.set_value('duration', r.default_duration)
				}
			});
		}
	},

	get_procedure_from_encounter: function(frm) {
		get_prescribed_procedure(frm);
	},

	toggle_payment_fields: function(frm) {
		frappe.call({
			method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.check_payment_fields_reqd',
			args: {'patient': frm.doc.patient},
			callback: function(data) {
				if (data.message.fee_validity) {
					// if fee validity exists and automated appointment invoicing is enabled,
					// show payment fields as non-mandatory
					frm.toggle_display('mode_of_payment', 0);
					frm.toggle_display('paid_amount', 0);
					frm.toggle_reqd('mode_of_payment', 0);
					frm.toggle_reqd('paid_amount', 0);
				} else {
					// if automated appointment invoicing is disabled, hide fields
					frm.toggle_display('mode_of_payment', data.message ? 1 : 0);
					frm.toggle_display('paid_amount', data.message ? 1 : 0);
					frm.toggle_reqd('mode_of_payment', data.message ? 1 : 0);
					frm.toggle_reqd('paid_amount', data.message ? 1 :0);
				}
			}
		});
	},

	get_prescribed_therapies: function(frm) {
		if (frm.doc.patient) {
			frappe.call({
				method: "erpnext.healthcare.doctype.patient_appointment.patient_appointment.get_prescribed_therapies",
				args: {patient: frm.doc.patient},
				callback: function(r) {
					if (r.message) {
						show_therapy_types(frm, r.message);
					} else {
						frappe.msgprint({
							title: __('Not Therapies Prescribed'),
							message: __('There are no Therapies prescribed for Patient {0}', [frm.doc.patient.bold()]),
							indicator: 'blue'
						});
					}
				}
			});
		}
	}
});

let check_and_set_availability = function(frm) {
	let selected_slot = null;
	let service_unit = null;
	let duration = null;

	show_availability();

	function show_empty_state(practitioner, appointment_date) {
		frappe.msgprint({
			title: __('Not Available'),
			message: __('Healthcare Practitioner {0} not available on {1}', [practitioner.bold(), appointment_date.bold()]),
			indicator: 'red'
		});
	}

	function show_availability() {
		let selected_practitioner = '';
		let selected_appointment_date = '';
		var d = new frappe.ui.Dialog({
			title: __("Available slots"),
			fields: [
				{ fieldtype: 'Link', options: 'Medical Department', reqd:1, fieldname: 'department', label: 'Medical Department'},
				{ fieldtype: 'Link', options: 'Healthcare Practitioner', reqd:1, fieldname: 'practitioner', label: 'Healthcare Practitioner'},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Link', options: 'Appointment Type', reqd:1, fieldname: 'appointment_type', label: 'Appointment Type'},
				{ fieldtype: 'Int', fieldname: 'duration', label: 'Duration'},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Date', reqd:1, fieldname: 'appointment_date', label: 'Date'},
				{ fieldtype: 'Section Break'},
				{ fieldtype: 'HTML', fieldname: 'available_slots'}

			],
			primary_action_label: __('Book'),
			primary_action: function() {
				frm.set_value('appointment_time', selected_slot);
				frm.set_value('service_unit', service_unit || '');
				// frm.set_value('duration', duration);
				frm.set_value('duration', d.get_value('duration'));
				frm.set_value('practitioner', d.get_value('practitioner'));
				frm.set_value('department', d.get_value('department'));
				frm.set_value('appointment_date', d.get_value('appointment_date'));
				frm.set_value('appointment_type', d.get_value('appointment_type'))
				d.hide();
				frm.enable_save();
				frm.save();
				d.get_primary_btn().attr('disabled', true);
			}
		});

		d.set_values({
			'department': frm.doc.department,
			'practitioner': frm.doc.practitioner,
			'appointment_date': frm.doc.appointment_date,
			'appointment_type': frm.doc.appointment_type
		});

		d.fields_dict['department'].df.onchange = () => {
			d.set_values({
				'practitioner': ''
			});
			let department = d.get_value('department');
			if (department) {
				d.fields_dict.practitioner.get_query = function() {
					return {
						filters: {
							'department': department
						}
					};
				};
			}
		};

		// disable dialog action initially
		d.get_primary_btn().attr('disabled', true);

		// Field Change Handler

		var fd = d.fields_dict;
		d.fields_dict["appointment_type"].df.onchange = () => {
			frappe.db.get_value("Appointment Type", d.get_value('appointment_type'), 'default_duration', function(r) {
				if(r && r.default_duration){
					d.set_values({
						'duration': r.default_duration
					});
				}
			});
		}
		d.fields_dict["appointment_date"].df.onchange = () => {
			if(d.get_value('appointment_date') && d.get_value('appointment_date') != selected_appointment_date){
				selected_appointment_date = d.get_value('appointment_date');
				show_slots(d, fd);
			}
			else if(!d.get_value("appointment_date")){
				selected_appointment_date = '';
			}
		}
		d.fields_dict["practitioner"].df.onchange = () => {
			if(d.get_value('practitioner') && d.get_value('practitioner') != selected_practitioner){
				selected_practitioner = d.get_value('practitioner');
				show_slots(d, fd);
			}
		};
		d.show();
		d.$wrapper.find('.modal-dialog').css("width", "800px");
	}

	function show_slots(d, fd) {
		if (d.get_value('appointment_date') && d.get_value('practitioner')){
			fd.available_slots.html("");
			exists_appointment(frm.doc.patient, d.get_value('practitioner'), d.get_value('appointment_date'), (exists)=>{
				if(exists){
					fd.available_slots.html("");
					frappe.call({
						method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data',
						args: {
							practitioner: d.get_value('practitioner'),
							date: d.get_value('appointment_date')
						},
						callback: (r) => {
							var data = r.message;
							if(data.slot_details.length > 0) {
								var $wrapper = d.fields_dict.available_slots.$wrapper;

								// make buttons for each slot
								var slot_details = data.slot_details;
								var slot_html = "";
								for (let i = 0; i < slot_details.length; i++) {
									slot_html = slot_html + `<label>${slot_details[i].slot_name}</label>`;
									slot_html = slot_html + `<br/>` + slot_details[i].avail_slot.map(slot => {
										let disabled = '';
										let start_str = slot.from_time;
										let slot_start_time = moment(slot.from_time, 'HH:mm:ss');
										let slot_to_time = moment(slot.to_time, 'HH:mm:ss');
										let interval = (slot_to_time - slot_start_time)/60000 | 0;
										//iterate in all booked appointments, update the start time and duration
										slot_details[i].appointments.forEach(function(booked) {
											let booked_moment = moment(booked.appointment_time, 'HH:mm:ss');
											let end_time = booked_moment.clone().add(booked.duration, 'minutes');
											if(slot_details[i].fixed_duration != 1){
												if(end_time.isSame(slot_start_time) || end_time.isBetween(slot_start_time, slot_to_time)){
													start_str = end_time.format("HH:mm")+":00";
													interval = (slot_to_time - end_time)/60000 | 0;
													return false;
												}
											}
											// Check for overlaps considering appointment duration
											if(slot_start_time.isBefore(end_time) && slot_to_time.isAfter(booked_moment)){
												// There is an overlap
												disabled = 'disabled="disabled"';
												return false;
											}
										});
										return `<button class="btn btn-default"
											data-name=${start_str}
											data-duration=${interval}
											data-service-unit="${slot_details[i].service_unit || ''}"
											flag-fixed-duration=${slot_details[i].fixed_duration || 0}
											style="margin: 0 10px 10px 0; width: 72px;" ${disabled}>
											${start_str.substring(0, start_str.length - 3)}
										</button>`;
									}).join("");
									slot_html = slot_html + `<br/>`;
								}

								$wrapper
									.css('margin-bottom', 0)
									.addClass('text-center')
									.html(slot_html);

								// blue button when clicked
								$wrapper.on('click', 'button', function() {
									var $btn = $(this);
									$wrapper.find('button').removeClass('btn-primary');
									$btn.addClass('btn-primary');
									selected_slot = $btn.attr('data-name');
									service_unit = $btn.attr('data-service-unit')
									duration = $btn.attr('data-duration')
									// enable dialog action
									d.get_primary_btn().attr('disabled', null);
									if($btn.attr('flag-fixed-duration') == 1){
										d.set_values({
											'duration': $btn.attr('data-duration')
										});
									}
								});

							}else {
								//	fd.available_slots.html("Please select a valid date.".bold())
								show_empty_state(d.get_value('practitioner'), d.get_value('appointment_date'));
							}
						},
						freeze: true,
						freeze_message: __("Fetching records......")
					});
				}
				else{
					fd.available_slots.html("");
				}
			});
		}
		else{
			fd.available_slots.html("Appointment date and Healthcare Practitioner are Mandatory".bold());
		}
	}

	function exists_appointment(patient, practitioner, appointment_date, callback) {
		frappe.call({
			method: "erpnext.healthcare.utils.exists_appointment",
			args:{
				appointment_date: appointment_date,
				practitioner: practitioner,
				patient: patient
			},
			callback: function(data) {
				if(data.message){
					var message  = __("Appointment is already booked on {0} for {1} with {2}, Do you want to book another appointment on this day?",
						[appointment_date.bold(), patient.bold(), practitioner.bold()]);
					frappe.confirm(
						message,
						function(){
							callback(true);
						},
						function(){
							frappe.show_alert({
								message:__("Select new date and slot to book appointment if you wish."),
								indicator:'yellow'
							});
							callback(false);
						}
					);
				}
				else{
					callback(true);
				}
			}
		});
	}
}

let get_prescribed_procedure = function(frm) {
	if (frm.doc.patient) {
		frappe.call({
			method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.get_procedure_prescribed',
			args: {patient: frm.doc.patient},
			callback: function(r) {
				if (r.message && r.message.length) {
					show_procedure_templates(frm, r.message);
				} else {
					frappe.msgprint({
						title: __('Not Found'),
						message: __('No Prescribed Procedures found for the selected Patient')
					});
				}
			}
		});
	} else {
		frappe.msgprint({
			title: __('Not Allowed'),
			message: __('Please select a Patient first')
		});
	}
};

let show_procedure_templates = function(frm, result){
	let d = new frappe.ui.Dialog({
		title: __('Prescribed Procedures'),
		fields: [
			{
				fieldtype: 'HTML', fieldname: 'procedure_template'
			}
		]
	});
	let html_field = d.fields_dict.procedure_template.$wrapper;
	html_field.empty();
	$.each(result, function(x, y) {
		let row = $(repl('<div class="col-xs-12" style="padding-top:12px; text-align:center;" >\
		<div class="col-xs-5"> %(encounter)s <br> %(consulting_practitioner)s <br> %(encounter_date)s </div>\
		<div class="col-xs-5"> %(procedure_template)s <br>%(practitioner)s  <br> %(date)s</div>\
		<div class="col-xs-2">\
		<a data-name="%(name)s" data-procedure-template="%(procedure_template)s"\
		data-encounter="%(encounter)s" data-practitioner="%(practitioner)s"\
		data-date="%(date)s"  data-department="%(department)s">\
		<button class="btn btn-default btn-xs">Add\
		</button></a></div></div><div class="col-xs-12"><hr/><div/>', {name:y[0], procedure_template: y[1],
				encounter:y[2], consulting_practitioner:y[3], encounter_date:y[4],
				practitioner:y[5]? y[5]:'', date: y[6]? y[6]:'', department: y[7]? y[7]:''})).appendTo(html_field);
		row.find("a").click(function() {
			frm.doc.procedure_template = $(this).attr('data-procedure-template');
			frm.doc.procedure_prescription = $(this).attr('data-name');
			frm.doc.practitioner = $(this).attr('data-practitioner');
			frm.doc.appointment_date = $(this).attr('data-date');
			frm.doc.department = $(this).attr('data-department');
			refresh_field('procedure_template');
			refresh_field('procedure_prescription');
			refresh_field('appointment_date');
			refresh_field('practitioner');
			refresh_field('department');
			d.hide();
			return false;
		});
	});
	if(!result || result.length < 1){
		var msg = "There are no procedure prescribed for patient "+frm.doc.patient;
		$(repl('<div class="text-left">%(msg)s</div>', {msg: msg})).appendTo(html_field);
	}
	d.show();
};

let show_therapy_types = function(frm, result) {
	var d = new frappe.ui.Dialog({
		title: __('Prescribed Therapies'),
		fields: [
			{
				fieldtype: 'HTML', fieldname: 'therapy_type'
			}
		]
	});
	var html_field = d.fields_dict.therapy_type.$wrapper;
	$.each(result, function(x, y){
		var row = $(repl('<div class="col-xs-12" style="padding-top:12px; text-align:center;" >\
		<div class="col-xs-5"> %(encounter)s <br> %(practitioner)s <br> %(date)s </div>\
		<div class="col-xs-5"> %(therapy)s </div>\
		<div class="col-xs-2">\
		<a data-therapy="%(therapy)s" data-therapy-plan="%(therapy_plan)s" data-name="%(name)s"\
		data-encounter="%(encounter)s" data-practitioner="%(practitioner)s"\
		data-date="%(date)s"  data-department="%(department)s">\
		<button class="btn btn-default btn-xs">Add\
		</button></a></div></div><div class="col-xs-12"><hr/><div/>', {therapy:y[0],
		name: y[1], encounter:y[2], practitioner:y[3], date:y[4],
		department:y[6]? y[6]:'', therapy_plan:y[5]})).appendTo(html_field);

		row.find("a").click(function() {
			frm.doc.therapy_type = $(this).attr("data-therapy");
			frm.doc.practitioner = $(this).attr("data-practitioner");
			frm.doc.department = $(this).attr("data-department");
			frm.doc.therapy_plan = $(this).attr("data-therapy-plan");
			frm.refresh_field("therapy_type");
			frm.refresh_field("practitioner");
			frm.refresh_field("department");
			frm.refresh_field("therapy-plan");
			frappe.db.get_value('Therapy Type', frm.doc.therapy_type, 'default_duration', (r) => {
				if (r.default_duration) {
					frm.set_value('duration', r.default_duration)
				}
			});
			d.hide();
			return false;
		});
	});
	d.show();
};

let create_vital_signs = function(frm) {
	if (!frm.doc.patient) {
		frappe.throw(__('Please select patient'));
	}
	frappe.route_options = {
		'patient': frm.doc.patient,
		'appointment': frm.doc.name,
		'company': frm.doc.company
	};
	frappe.new_doc('Vital Signs');
};

let update_status = function(frm, status){
	let doc = frm.doc;
	frappe.confirm(__('Are you sure you want to cancel this appointment?'),
		function() {
			frappe.call({
				method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.update_status',
				args: {appointment_id: doc.name, status:status},
				callback: function(data) {
					if (!data.exc) {
						frm.reload_doc();
					}
				}
			});
		}
	);
};

frappe.ui.form.on('Patient Appointment', 'practitioner', function(frm) {
	if (frm.doc.practitioner) {
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Healthcare Practitioner',
				name: frm.doc.practitioner
			},
			callback: function (data) {
				frappe.model.set_value(frm.doctype, frm.docname, 'department', data.message.department);
				frappe.model.set_value(frm.doctype, frm.docname, 'paid_amount', data.message.op_consulting_charge);
				frappe.model.set_value(frm.doctype, frm.docname, 'billing_item', data.message.op_consulting_charge_item);
			}
		});
	}
});

frappe.ui.form.on('Patient Appointment', 'patient', function(frm) {
	if (frm.doc.patient) {
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Patient',
				name: frm.doc.patient
			},
			callback: function (data) {
				let age = null;
				if (data.message.dob) {
					age = calculate_age(data.message.dob);
				}
				frappe.model.set_value(frm.doctype,frm.docname, 'patient_age', age);
			}
		});
	}
});

frappe.ui.form.on('Patient Appointment', 'appointment_type', function(frm) {
	if (frm.doc.appointment_type) {
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Appointment Type',
				name: frm.doc.appointment_type
			},
			callback: function(data) {
				frappe.model.set_value(frm.doctype,frm.docname, 'duration',data.message.default_duration);
			}
		});
	}
});

let calculate_age = function(birth) {
	let ageMS = Date.parse(Date()) - Date.parse(birth);
	let age = new Date();
	age.setTime(ageMS);
	let years =  age.getFullYear() - 1970;
	return  years + ' Year(s) ' + age.getMonth() + ' Month(s) ' + age.getDate() + ' Day(s)';
};
