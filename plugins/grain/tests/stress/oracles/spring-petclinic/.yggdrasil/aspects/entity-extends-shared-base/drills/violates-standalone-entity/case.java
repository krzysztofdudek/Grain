package org.springframework.samples.petclinic.owner;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "reminders")
public class Reminder {

	@Id
	@GeneratedValue
	private Long reminderId;

	public Long getReminderId() {
		return this.reminderId;
	}

}
