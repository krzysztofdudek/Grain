package org.springframework.samples.petclinic.owner;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;

@Component
public class OwnerRepository extends Object {

	@PersistenceContext
	private EntityManager em;

	public Owner findById(Integer id) {
		return em.find(Owner.class, id);
	}

}
